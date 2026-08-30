import { db } from '@/lib/db'
import { parseTimes } from '@/lib/parse-times'
import { clockParts, DEFAULT_TZ } from '@/lib/reminder-clock'
import { todayStr } from '@/lib/utils'

export function localReminderDate(timezone?: string | null): string {
  try {
    return clockParts(timezone || DEFAULT_TZ).isoDate
  } catch {
    return todayStr()
  }
}

/** Create today's pending reminder rows for a medication (idempotent). */
export async function ensureTodayRemindersForMed(
  medicationId: string,
  timesRaw: unknown,
  dateIso: string = todayStr(),
): Promise<number> {
  const times = parseTimes(timesRaw)
  let created = 0
  for (const time of times) {
    try {
      const exists = await db.reminder.findUnique({
        where: { medicationId_date_time: { medicationId, date: dateIso, time } },
        select: { id: true },
      })
      if (!exists) {
        await db.reminder.create({
          data: { medicationId, date: dateIso, time, status: 'pending' },
        })
        created++
      }
    } catch {
      /* unique race */
    }
  }
  return created
}

/** Ensure every active medication has reminder rows for its owner’s local date. */
export async function ensureTodayRemindersForAllActive(): Promise<number> {
  const meds = await db.medication.findMany({
    where: { active: true },
    select: {
      id: true,
      times: true,
      user: { select: { timezone: true } },
      familyMember: {
        select: { family: { select: { owner: { select: { timezone: true } } } } },
      },
    },
  })
  let n = 0
  for (const med of meds) {
    const timezone = med.familyMember?.family.owner.timezone || med.user?.timezone || DEFAULT_TZ
    n += await ensureTodayRemindersForMed(med.id, med.times, localReminderDate(timezone))
  }
  return n
}
