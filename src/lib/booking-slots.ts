/**
 * FIX #6: build the real bookable slot list for a doctor+date.
 *
 * Previously the booking dialogs hardcoded six static labels ("09:00 AM" …)
 * that ignored availability and existing bookings, so users could select
 * slots the server then rejected. This module expands the doctor's availability
 * windows for the requested weekday into 30-minute slots and marks slots that
 * collide with an existing booking (±30 min — mirroring the server's conflict
 * window on POST /api/appointments) or that are already in the past.
 *
 * Slots are constructed as LOCAL wall-clock instants — exactly how the booking
 * submit builds `scheduledAt` (new Date(`${date}T${HH:MM}:00`)) — so what the
 * user sees is what gets booked.
 */

export type SlotWindow = { day: string; start: string; end: string }

export type SlotOption = {
  /** HH:MM 24h — what the booking form submits as `time`. */
  value: string
  /** 12-hour display label, e.g. "9:00 AM". */
  label: string
  available: boolean
  /** Why the slot is not selectable. */
  reason?: 'booked' | 'past'
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function toMinutes(hhmm: string): number {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm ?? '')
  if (!m) return NaN
  return parseInt(m[1] ?? '0', 10) * 60 + parseInt(m[2] ?? '0', 10)
}

function label12(value: string): string {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value)
  if (!m) return value
  let h = parseInt(m[1] ?? '0', 10)
  const suffix = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m[2]} ${suffix}`
}

export function generateSlots(
  windows: SlotWindow[],
  dateStr: string,
  opts: { booked?: string[]; slotMinutes?: number; now?: Date } = {},
): SlotOption[] {
  const slotMinutes = opts.slotMinutes ?? 30
  const now = opts.now ?? new Date()
  const bookedMs = (opts.booked ?? [])
    .map((b) => new Date(b).getTime())
    .filter((t) => !isNaN(t))

  const weekday = DAY_NAMES[new Date(`${dateStr}T12:00:00`).getDay()] ?? 'monday'
  const dayWindows = (windows ?? []).filter((w) => w && w.day === weekday)

  const build = (windowsToUse: SlotWindow[]): SlotOption[] => {
    const out: SlotOption[] = []
    for (const w of windowsToUse) {
      const startMin = toMinutes(w.start)
      const endMin = toMinutes(w.end)
      if (isNaN(startMin) || isNaN(endMin) || endMin <= startMin) continue
      for (let t = startMin; t + slotMinutes <= endMin; t += slotMinutes) {
        const value = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
        if (out.some((s) => s.value === value)) continue
        const atMs = new Date(`${dateStr}T${value}:00`).getTime()
        let available = true
        let reason: SlotOption['reason']
        if (atMs <= now.getTime()) {
          available = false
          reason = 'past'
        } else if (bookedMs.some((b) => Math.abs(b - atMs) <= 30 * 60 * 1000)) {
          available = false
          reason = 'booked'
        }
        out.push({ value, label: label12(value), available, reason })
      }
    }
    return out.sort((a, b) => a.value.localeCompare(b.value))
  }

  const slots = build(dayWindows)
  if (slots.length > 0) return slots

  // Fallback: doctors without configured availability keep the classic
  // clinic-hours grid (morning + afternoon) so the dialog is never empty —
  // but still with booked/past marking applied.
  return build([
    { day: weekday, start: '09:00', end: '12:30' },
    { day: weekday, start: '14:00', end: '18:00' },
  ])
}
