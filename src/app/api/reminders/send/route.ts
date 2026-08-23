import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireSystemToken, jsonOk, jsonError } from '@/lib/api-helpers'
import { rateLimit } from '@/lib/security'
import { logger } from '@/lib/logger'
import { sendPushToUser } from '@/lib/push-server'
import { clockParts } from '@/lib/reminder-clock'

export const dynamic = 'force-dynamic'

/**
 * GET+POST /api/reminders/send
 *
 * Vercel Cron invokes GET with Authorization: Bearer CRON_SECRET.
 * Matches pending reminders whose stored HH:MM is due in America/New_York
 * (US-first), writes an in-app inbox row, and best-effort pushes.
 */
async function run(req: NextRequest) {
  const limited = rateLimit(req, 10, 60000)
  if (limited) return limited

  const { response, user } = await requireSystemToken(req)
  if (response || !user) return response!

  const clock = clockParts()
  const date = new Date(clock.isoDate)
  // Hobby plan: this job runs once daily (08:00 ET). Send every pending
  // dose whose stored HH:MM is already due today, not only the current minute.
  // While the app is open, MedicationAlarmHost covers minute-level timing.

  try {
    const dueReminders = await db.reminder.findMany({
      where: {
        date,
        time: { lte: clock.timeStr },
        status: 'pending',
      },
      include: {
        medication: {
          include: {
            user: { select: { id: true, name: true } },
            familyMember: { include: { family: { select: { ownerId: true } } } },
          },
        },
      },
    })

    if (dueReminders.length === 0) {
      return jsonOk({
        checked: true,
        sent: 0,
        message: 'No reminders due',
        time: clock.timeStr,
        date: clock.dateStr,
      })
    }

    let sent = 0
    let failed = 0

    for (const reminder of dueReminders) {
      const userId =
        reminder.medication?.userId ||
        reminder.medication?.familyMember?.family?.ownerId ||
        null
      if (!userId) {
        failed++
        continue
      }

      const medName = reminder.medication?.name || 'your medication'
      const dosage = reminder.medication?.dosage || ''
      const frequency = reminder.medication?.frequency || ''
      const body =
        [dosage, frequency].filter(Boolean).join(' · ') || `Reminder: take ${medName}`
      const title = `Time to take ${medName}`

      try {
        const already = await db.notificationLog.findFirst({
          where: {
            userId,
            type: 'reminder',
            title,
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
              body,
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
        await sendPushToUser(userId, {
          title,
          body,
          tag: `reminder-${reminder.medicationId}-${clock.dateStr}`,
          url: '/patient',
        })
        sent++
      } catch (e) {
        // In-app row already written — still count as delivered to the inbox
        sent++
        logger.phiSafeError(e, 'reminder.push')
      }
    }

    return jsonOk({
      checked: true,
      due: dueReminders.length,
      sent,
      failed,
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
