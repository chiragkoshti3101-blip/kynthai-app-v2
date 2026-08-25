import { db } from '@/lib/db'
import { parseTimes } from '@/lib/parse-times'
import { todayStr } from '@/lib/utils'

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

/** Ensure every active medication has today's reminder rows. */
export async function ensureTodayRemindersForAllActive(): Promise<number> {
  const meds = await db.medication.findMany({
    where: { active: true },
    select: { id: true, times: true },
  })
  let n = 0
  for (const med of meds) {
    n += await ensureTodayRemindersForMed(med.id, med.times)
  }
  return n
}
