import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireSystemToken, jsonOk, jsonError } from '@/lib/api-helpers'
import { rateLimit } from '@/lib/security'
import { logger } from '@/lib/logger'
import { sendReminder, sendNotification } from '@/lib/notifications'
import { clockParts, isDueNow } from '@/lib/reminder-clock'

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

/**
 * Closed-app dose delivery: push + email when the browser is closed.
 * Multi-timezone so IST users are not stuck on ET-only matching.
 */
async function run(req: NextRequest) {
  const limited = rateLimit(req, 30, 60_000)
  if (limited) return limited

  const { response, user } = await requireSystemToken(req)
  if (response || !user) return response!

  const modeParam = req.nextUrl.searchParams.get('mode')
  const mode = modeParam === 'tick' ? 'tick' : 'catchup'
  const primary = clockParts('America/New_York')

  try {
    const seen = new Set<string>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dueReminders: any[] = []

    for (const tz of ZONES) {
      const clock = clockParts(tz)
      const date = new Date(`${clock.dateStr}T12:00:00.000Z`)
      const candidates = await db.reminder.findMany({
        where: {
          date,
          status: 'pending',
          reminderCount: 0,
          ...(mode === 'catchup'
            ? { time: { lte: clock.timeStr } }
            : {
                OR: [{ time: clock.timeStr }, { time: clock.prevTimeStr }],
              }),
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
                        select: {
                          id: true,
                          name: true,
                          email: true,
                          phone: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        take: 100,
      })

      for (const r of candidates) {
        if (seen.has(r.id)) continue
        if (mode === 'tick' && !isDueNow(r.time, clock)) continue
        seen.add(r.id)
        dueReminders.push(r)
      }
    }

    if (dueReminders.length === 0) {
      return jsonOk({
        checked: true,
        mode,
        sent: 0,
        skipped: 0,
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
      if (reminder.reminderCount > 0) {
        skipped++
        continue
      }

      const medUser = reminder.medication?.user
      const familyOwner = reminder.medication?.familyMember?.family?.owner
      const userId: string | null =
        medUser?.id ||
        reminder.medication?.familyMember?.family?.ownerId ||
        null
      if (!userId) {
        failed++
        continue
      }

      const medName = reminder.medication?.name || 'your medication'
      const dosage = reminder.medication?.dosage || ''
      const frequency = reminder.medication?.frequency || ''
      const bodyBits = [dosage, frequency, reminder.time].filter(Boolean).join(' · ')
      const body = bodyBits || `Reminder: take ${medName}`
      const title = `Time to take ${medName}`
      const dedupeKey = `dose:${reminder.id}`
      const date = reminder.date

      try {
        const already = await db.notificationLog.findFirst({
          where: {
            userId,
            type: 'reminder',
            body: { contains: dedupeKey },
            createdAt: { gte: date },
          },
          select: { id: true },
        })
        if (!already) {
          await db.notificationLog.create({
            data: {
              userId,
              channel: 'in-app',
              type: 'reminder',
              title,
              body: `${body} · ${dedupeKey}`,
              recipient: userId,
              status: 'sent',
              cost: 0,
            },
          })
        }
      } catch (e) {
        logger.phiSafeError(e, 'reminder.inApp')
      }

      try {
        const route = await sendReminder(
          userId as string,
          String(medName),
          String(dosage || body),
          String(reminder.time),
          {
            email: medUser?.email || familyOwner?.email || undefined,
            phone: medUser?.phone || familyOwner?.phone || undefined,
          },
        )
        await db.reminder.update({
          where: { id: reminder.id },
          data: { reminderCount: { increment: 1 } },
        })
        const ch = route.channel || 'none'
        channels[ch] = (channels[ch] || 0) + 1
        sent++
      } catch (e) {
        try {
          await db.reminder.update({
            where: { id: reminder.id },
            data: { reminderCount: { increment: 1 } },
          })
        } catch {
          /* ignore */
        }
        try {
          const email = medUser?.email || familyOwner?.email
          if (email) {
            await sendNotification(
              { userId, email },
              {
                title,
                body: `${body}\n\nOpen Kynthai: https://kynthai.app/patient`,
                type: 'reminder',
                data: { url: '/patient' },
              },
            )
          }
        } catch {
          /* ignore */
        }
        sent++
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
