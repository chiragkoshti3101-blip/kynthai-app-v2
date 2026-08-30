import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

//DateTime column in Postgres via Prisma.
export function toISODateTime(dateStr: string): string {
  return `${dateStr}T00:00:00.000Z`
}

export function todayStr(timeZone = 'America/New_York'): string {
  // Reminder rows store a local-looking calendar date. Use the recipient’s
  // IANA zone when available; keep the historical New York fallback only for
  // legacy accounts that have not stored a timezone yet.
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date())
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]))
    const dateStr = `${map.year}-${map.month}-${map.day}`
    return toISODateTime(dateStr)
  } catch {
    const d = new Date()
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return toISODateTime(dateStr)
  }
}

export function yesterdayStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return toISODateTime(dateStr)
}

export function dateStr(d: Date): string {
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return toISODateTime(dateStr)
}

export function startOfWeek(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d)
  monday.setDate(diff)
  const dateStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
  return toISODateTime(dateStr)
}

export function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toISODateTime(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
}
