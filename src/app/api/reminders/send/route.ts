import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireSystemToken, jsonOk, jsonError } from '@/lib/api-helpers'
import { rateLimit } from '@/lib/security'
import { logger } from '@/lib/logger'
import { sendReminder } from '@/lib/notifications'
import { clockParts, isDueNow, nearbyTimeStrings } from '@/lib/reminder-clock'
import { parseTimes } from '@/lib/parse-times'
import { ensureTodayRemindersForAllActive } from '@/lib/ensure-reminders'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Asia/Kolkata',
  'UTC',
]

function dayUtc(dateStr: string) {
  // Must match todayStr()/toISODateTime used when creating reminder rows
  return new Date(`${dateStr}T00:00:00.000Z`)
}

async function run(req: NextRequest) {
  const limited = rateLimit(req, 60, 60_000)
  if (limited) return limited

  const { response, user } = await requireSystemToken(req)
  if (response || !user) return response!

  const modeParam = req.nextUrl.searchParams.get('mode')
  const mode = modeParam === 'tick' ? 'tick' : 'catchup'
  const primary = clockParts('America/New_York')

  try {
    const ensured = await ensureTodayRemindersForAllActive()

    const seen = new Set<string>()
    const dueReminders: any[] = []

    for (const tz of ZONES) {
      const clock = clockParts(tz)
      const dates = [dayUtc(clock.dateStr)]
      if (clock.prevDateStr !== clock.dateStr) dates.push(dayUtc(clock.prevDateStr))

      const candidates = await db.reminder.findMany({
        where: {
          date: { in: dates },
          status: 'pending',
          ...(mode === 'catchup'
            ? { time: { lte: clock.timeStr } }
            : { time: { in: nearbyTimeStrings(tz, new Date(), 8) } }),
        },
        include: {
          medication: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  emailOptOut: true,
                },
              },
              familyMember: {
                include: {
                  family: {
                    select: {
                      ownerId: true,
                      owner: {
                        select: { id: true, name: true, email: true, phone: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        take: 200,
      })

      for (const r of candidates) {
        if (seen.has(r.id)) continue
        if (mode === 'tick' && !isDueNow(r.time, clock, 8)) continue
        seen.add(r.id)
        dueReminders.push(r)
      }
    }

    // Fallback: active medications whose times are due even if reminder rows lagged
    if (dueReminders.length === 0 && mode === 'tick') {
      const meds = await db.medication.findMany({
        where: { active: true },
        include: {
          user: {
            select: { id: true, name: true, email: true, phone: true, emailOptOut: true },
          },
          familyMember: {
            include: {
              family: {
                select: {
                  ownerId: true,
                  owner: { select: { id: true, name: true, email: true, phone: true } },
                },
              },
            },
          },
        },
        take: 500,
      })
      for (const tz of ZONES) {
        const clock = clockParts(tz)
        for (const med of meds) {
          for (const t of parseTimes(med.times)) {
            if (!isDueNow(t, clock, 8)) continue
            const fakeId = `med:${med.id}:${clock.dateStr}:${t}`
            if (seen.has(fakeId)) continue
            seen.add(fakeId)
            dueReminders.push({
              id: fakeId,
              time: t,
              reminderCount: 0,
              date: dayUtc(clock.dateStr),
              medication: med,
            })
          }
        }
      }
    }

    if (dueReminders.length === 0) {
      return jsonOk({
        checked: true,
        mode,
        sent: 0,
        skipped: 0,
        ensured,
        message: 'No reminders due',
        time: primary.timeStr,
        date: primary.dateStr,
        zones: ZONES,
      })
    }

    let sent = 0
    let skipped = 0
    let failed = 0
    const channels: Record<string, number> = {}

    for (const reminder of dueReminders) {
      const medUser = reminder.medication?.user
      const familyOwner = reminder.medication?.familyMember?.family?.owner
      const userId: string | null =
        medUser?.id || reminder.medication?.familyMember?.family?.ownerId || null
      if (!userId) {
        failed++
        continue
      }

      const medName = reminder.medication?.name || 'your medication'
      const dosage = reminder.medication?.dosage || ''
      const bodyBits = [dosage, reminder.medication?.frequency || '', reminder.time]
        .filter(Boolean)
        .join(' · ')
      const body = bodyBits || `Reminder: take ${medName}`
      const title = `Time to take ${medName}`

      try {
        // ponytail: dedupe on title (med name) + body containing the scheduled
        // time + 30-min window. The old check matched `body contains dedupeKey`
        // but the notification body never included the dedupeKey → dedupe never
        // fired → every minute-tick re-sent the same dose (the "flood" bug).
        const already = await db.notificationLog.findFirst({
          where: {
            userId,
            type: 'reminder',
            title,
            body: { contains: String(reminder.time) },
            createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
          },
          select: { id: true },
        })
        if (already) {
          skipped++
          continue
        }
      } catch {
        /* continue */
      }

      try {
        const route = await sendReminder(
          userId,
          String(medName),
          String(dosage || body),
          String(reminder.time),
          {
            email: medUser?.email || familyOwner?.email || undefined,
            phone: medUser?.phone || familyOwner?.phone || undefined,
          },
        )
        const ch = route.channel || 'none'
        channels[ch] = (channels[ch] || 0) + 1

        if (route.delivered) {
          sent++
          if (typeof reminder.id === 'string' && !String(reminder.id).startsWith('med:')) {
            await db.reminder
              .update({
                where: { id: reminder.id },
                data: { reminderCount: { increment: 1 } },
              })
              .catch(() => {})
          }
        } else {
          // Keep pending so the next tick can retry (e.g. no push sub yet)
          failed++
        }
      } catch (e) {
        failed++
        logger.phiSafeError(e, 'reminder.multiChannel')
      }
    }

    return jsonOk({
      checked: true,
      mode,
      due: dueReminders.length,
      sent,
      skipped,
      failed,
      ensured,
      channels,
      time: primary.timeStr,
      date: primary.dateStr,
      zones: ZONES,
    })
  } catch (error) {
    logger.phiSafeError(error)
    return jsonError('Internal server error', 500)
  }
}

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}
