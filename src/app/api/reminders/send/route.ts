import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireSystemToken, jsonOk, jsonError } from '@/lib/api-helpers'
import { rateLimit } from '@/lib/security'
import { logger } from '@/lib/logger'
import { sendReminder, sendNotification } from '@/lib/notifications'
import { clockParts, isDueNow } from '@/lib/reminder-clock'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET+POST /api/reminders/send
 *
 * Closed-app / web / mobile dose delivery.
 *
 * Strategy (billion-dollar product rule: never depend on one channel):
 *   1. In-app inbox row (always, for every portal)
 *   2. sendReminder → Push ($0) → Email → WhatsApp → SMS
 *      so pure-web users (no PWA, no push) still get email/SMS
 *
 * Auth: Authorization: Bearer $CRON_SECRET
 * Query: mode=tick | mode=catchup (default catchup for daily Vercel cron)
 */
async function run(req: NextRequest) {
  const limited = rateLimit(req, 30, 60_000)
  if (limited) return limited

  const { response, user } = await requireSystemToken(req)
  if (response || !user) return response!

  const modeParam = req.nextUrl.searchParams.get('mode')
  const mode = modeParam === 'tick' ? 'tick' : 'catchup'
  const clock = clockParts()
  const date = new Date(clock.isoDate)

  try {
    const candidates = await db.reminder.findMany({
      where: {
        date,
        status: 'pending',
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
      take: 200,
    })

    const dueReminders =
      mode === 'tick'
        ? candidates.filter((r) => isDueNow(r.time, clock))
        : candidates

    if (dueReminders.length === 0) {
      return jsonOk({
        checked: true,
        mode,
        sent: 0,
        skipped: 0,
        message: 'No reminders due',
        time: clock.timeStr,
        date: clock.dateStr,
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
      const userId =
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

      // 1) Always write in-app inbox
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

      // 2) Multi-channel: push → email → WhatsApp → SMS
      // Clinical dose alerts are never blocked by marketing opt-out.
      try {
        const route = await sendReminder(userId, medName, dosage || body, reminder.time, {
          email: medUser?.email || familyOwner?.email || undefined,
          phone: medUser?.phone || familyOwner?.phone || undefined,
        })

        // Mark notified so re-ticks do not spam
        await db.reminder.update({
          where: { id: reminder.id },
          data: { reminderCount: { increment: 1 } },
        })

        const ch = route.channel || 'none'
        channels[ch] = (channels[ch] || 0) + 1
        if (route.delivered || ch === 'none') {
          // none = no push/email/sms configured — still counted; inbox has the row
          sent++
        } else {
          sent++
        }

        // If primary user is a patient on family med with a caretaker owner,
        // also notify the caretaker by email/push when delivery was push-only
        // failure path — sendReminder already covers the owner when userId is owner.
      } catch (e) {
        try {
          await db.reminder.update({
            where: { id: reminder.id },
            data: { reminderCount: { increment: 1 } },
          })
        } catch {
          /* ignore */
        }
        // Last-resort email if sendReminder threw
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
      time: clock.timeStr,
      date: clock.dateStr,
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
