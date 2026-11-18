/**
 * Doctor availability and bookable slots — one rule for "may this instant be
 * booked?", shared by POST /api/appointments, GET /api/doctors/[id]/slots and
 * the doctor's patient-linking route.
 *
 * Two invariants matter:
 *  - windows are interpreted in the DOCTOR's zone (the clinic zone), never the
 *    viewer's, so a browser in another timezone cannot shift a 09:00 clinic
 *    start into whatever hour it likes;
 *  - the booking UI does not re-derive anything: `buildDaySlots` returns
 *    absolute instants, and the form submits one of them verbatim, so the grid
 *    cannot offer a time the gate then rejects.
 */

export type AvailabilityWindow = { day: string; start: string; end: string }

/** A live booking the grid must leave alone. */
export type BookedInterval = { at: Date | string; durationMinutes: number }

/** Absolute instant the form submits, plus its label in the viewer's zone. */
export type BookingSlot = {
  at: string
  label: string
  available: boolean
  reason?: 'booked' | 'past'
}

/**
 * Clinic grid used when a doctor has configured nothing for a weekday.
 * `User.timezone` null means this zone elsewhere in the app, so it is also the
 * fallback clinic zone for a doctor who never set one.
 */
export const CLINIC_FALLBACK_TIME_ZONE = 'America/New_York'
export const DEFAULT_CLINIC_WINDOWS: ReadonlyArray<{ start: string; end: string }> = [
  { start: '09:00', end: '12:30' },
  { start: '14:00', end: '18:00' },
]

export const MAX_APPOINTMENT_MINUTES = 120
export const DEFAULT_APPOINTMENT_MINUTES = 15
/** Spacing of the bookable grid inside a window. */
export const SLOT_MINUTES = 30

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** "HH:MM" (24h) → minutes since midnight, or NaN when malformed. */
export function toMinutes(hhmm: string): number {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm ?? '')
  if (!m) return NaN
  return parseInt(m[1] ?? '0', 10) * 60 + parseInt(m[2] ?? '0', 10)
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** First usable IANA zone from the candidates, else UTC. */
export function resolveTimeZone(...candidates: Array<string | null | undefined>): string {
  return candidates.find((c): c is string => Boolean(c && c.length <= 64 && isValidTimeZone(c))) ?? 'UTC'
}

/** The zone a doctor's hours are written in. */
export function clinicTimeZone(userTimeZone?: string | null): string {
  return resolveTimeZone(userTimeZone, CLINIC_FALLBACK_TIME_ZONE)
}

// ── Zone arithmetic ──────────────────────────────────────────────────────────

type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: string
}

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0')
  const year = value('year')
  const month = value('month')
  const day = value('day')
  return {
    year,
    month,
    day,
    hour: value('hour'),
    minute: value('minute'),
    weekday: DAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? 'monday',
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Weekday + minutes-since-midnight of `instant` as seen in `timeZone`. */
function wallClock(instant: Date, timeZone: string) {
  const p = zonedParts(instant, timeZone)
  return { day: p.weekday, minutes: p.hour * 60 + p.minute, label: `${pad(p.hour)}:${pad(p.minute)}` }
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  return asUtc - Math.floor(instant.getTime() / 60_000) * 60_000
}

/**
 * The UTC instant of a wall-clock time in `timeZone`. Two passes settle DST:
 * the offset is looked up at the first approximation, then re-checked at the
 * corrected instant.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const base = Date.UTC(year, month - 1, day, hour, minute)
  let instant = base
  for (let pass = 0; pass < 2; pass++) {
    instant = base - zoneOffsetMs(new Date(instant), timeZone)
  }
  return new Date(instant)
}

function addDays(date: { year: number; month: number; day: number }, days: number) {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days))
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

// ── Windows ──────────────────────────────────────────────────────────────────

/** The doctor's usable windows for one weekday, with the clinic-grid fallback. */
function windowsForDay(
  slots: ReadonlyArray<AvailabilityWindow>,
  day: string
): AvailabilityWindow[] {
  const forDay = slots.filter((s) => {
    const start = toMinutes(s.start)
    const end = toMinutes(s.end)
    return s.day === day && Number.isFinite(start) && Number.isFinite(end) && end > start
  })
  if (forDay.length > 0) return forDay
  return DEFAULT_CLINIC_WINDOWS.map((w) => ({ day, ...w }))
}

// ── Bookings ─────────────────────────────────────────────────────────────────

function toIntervals(booked: ReadonlyArray<BookedInterval>) {
  return booked
    .map((b) => {
      const start = (b.at instanceof Date ? b.at : new Date(b.at)).getTime()
      const minutes = b.durationMinutes || DEFAULT_APPOINTMENT_MINUTES
      return { start, end: start + minutes * 60_000 }
    })
    .filter((b) => !isNaN(b.start))
}

function overlaps(instant: Date, minutes: number, interval: { start: number; end: number }): boolean {
  const start = instant.getTime()
  return start < interval.end && interval.start < start + minutes * 60_000
}

/** Half-open overlap of two [start, start+duration) ranges. */
export function timeRangesOverlap(
  aStart: Date,
  aMinutes: number,
  bStart: Date,
  bMinutes: number
): boolean {
  const a0 = aStart.getTime()
  const b0 = bStart.getTime()
  return a0 < b0 + bMinutes * 60_000 && b0 < a0 + aMinutes * 60_000
}

/**
 * Postgres rejects a booking overlapping a live one (see the
 * `appointments_doctor_slot_no_overlap` exclusion constraint). PostgREST
 * surfaces SQLSTATE 23P01; other error paths only keep the message.
 */
export function isSlotConflictError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null | undefined
  return (
    e?.code === '23P01' || /exclusion constraint|conflicting key value violates/i.test(String(e?.message ?? ''))
  )
}

// ── Gates ────────────────────────────────────────────────────────────────────

/**
 * Is `instant` inside the doctor's hours in `timeZone` (always the clinic
 * zone), with room for the whole appointment before the window closes?
 */
export function checkAvailability(input: {
  slots: ReadonlyArray<AvailabilityWindow>
  instant: Date
  durationMinutes: number
  timeZone: string
}) {
  const { slots, instant, durationMinutes, timeZone } = input
  const { day, minutes, label } = wallClock(instant, timeZone)
  const windows = windowsForDay(slots, day)
  const allowed = windows.some((w) => {
    const start = toMinutes(w.start)
    const end = toMinutes(w.end)
    return minutes >= start && minutes + durationMinutes <= end
  })
  return { allowed, day, timeZone, localTime: label, windows }
}

/**
 * Copy and detail payload for a 409 OUTSIDE_AVAILABILITY response, so the
 * booking and reschedule routes reject a slot with identical text.
 */
export function availabilityRejection(
  availability: ReturnType<typeof checkAvailability>,
  durationMinutes: number
) {
  const hours = availability.windows.map((w) => `${w.start}–${w.end}`).join(', ')
  return {
    message: `Doctor is not available at that time. Hours on ${availability.day}: ${hours} (clinic time, ${availability.timeZone})`,
    details: {
      day: availability.day,
      localTime: availability.localTime,
      windows: availability.windows,
      timeZone: availability.timeZone,
      durationMinutes,
    },
  }
}

/**
 * Bookable slots for the viewer's calendar day, as absolute instants.
 *
 * The viewer's day can straddle two clinic days, so the clinic dates either
 * side of it are scanned and every candidate is filtered by whether it lands
 * inside the viewer's day.
 */
export function buildDaySlots(input: {
  windows: ReadonlyArray<AvailabilityWindow>
  viewerDate: string
  viewerTimeZone: string
  clinicTimeZone: string
  booked?: ReadonlyArray<BookedInterval>
  slotMinutes?: number
  now?: Date
}): BookingSlot[] {
  const slotMinutes = input.slotMinutes ?? SLOT_MINUTES
  const now = input.now ?? new Date()
  const [year, month, day] = input.viewerDate.split('-').map(Number)
  if (!year || !month || !day) return []

  const dayStart = zonedTimeToUtc(year, month, day, 0, 0, input.viewerTimeZone)
  const nextDay = addDays({ year, month, day }, 1)
  const dayEnd = zonedTimeToUtc(nextDay.year, nextDay.month, nextDay.day, 0, 0, input.viewerTimeZone)
  const booked = toIntervals(input.booked ?? [])
  const clinicDay = zonedParts(dayStart, input.clinicTimeZone)

  const slots = new Map<string, BookingSlot>()
  for (let offset = -1; offset <= 1; offset++) {
    const clinicDate = addDays(clinicDay, offset)
    const weekday = DAY_NAMES[new Date(Date.UTC(clinicDate.year, clinicDate.month - 1, clinicDate.day)).getUTCDay()] ?? 'monday'
    for (const window of windowsForDay(input.windows, weekday)) {
      const startMin = toMinutes(window.start)
      const endMin = toMinutes(window.end)
      for (let t = startMin; t + slotMinutes <= endMin; t += slotMinutes) {
        const instant = zonedTimeToUtc(
          clinicDate.year,
          clinicDate.month,
          clinicDate.day,
          Math.floor(t / 60),
          t % 60,
          input.clinicTimeZone
        )
        const ms = instant.getTime()
        if (ms < dayStart.getTime() || ms >= dayEnd.getTime()) continue
        const at = instant.toISOString()
        if (slots.has(at)) continue
        const past = ms <= now.getTime()
        const taken = booked.some((b) => overlaps(instant, slotMinutes, b))
        slots.set(at, {
          at,
          label: wallClock(instant, input.viewerTimeZone).label,
          available: !past && !taken,
          ...(past ? { reason: 'past' as const } : taken ? { reason: 'booked' as const } : {}),
        })
      }
    }
  }
  return [...slots.values()].sort((a, b) => a.at.localeCompare(b.at))
}

/**
 * First bookable instant at or after `from`, walking the clinic calendar.
 * Used when the app itself has to place a booking (doctor-initiated intake).
 */
export function findNextBookableSlot(input: {
  windows: ReadonlyArray<AvailabilityWindow>
  clinicTimeZone: string
  from: Date
  appointmentMinutes?: number
  booked?: ReadonlyArray<BookedInterval>
  maxDays?: number
}): Date | null {
  const appointment = input.appointmentMinutes ?? DEFAULT_APPOINTMENT_MINUTES
  const booked = toIntervals(input.booked ?? [])
  const start = zonedParts(input.from, input.clinicTimeZone)

  for (let offset = 0; offset <= (input.maxDays ?? 14); offset++) {
    const date = addDays(start, offset)
    const weekday = DAY_NAMES[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()] ?? 'monday'
    for (const window of windowsForDay(input.windows, weekday)) {
      const startMin = toMinutes(window.start)
      const endMin = toMinutes(window.end)
      for (let t = startMin; t + appointment <= endMin; t += appointment) {
        const instant = zonedTimeToUtc(
          date.year,
          date.month,
          date.day,
          Math.floor(t / 60),
          t % 60,
          input.clinicTimeZone
        )
        if (instant.getTime() < input.from.getTime()) continue
        if (booked.some((b) => overlaps(instant, appointment, b))) continue
        return instant
      }
    }
  }
  return null
}
