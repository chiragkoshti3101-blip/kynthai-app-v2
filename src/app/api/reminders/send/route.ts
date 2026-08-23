import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireSystemToken, jsonOk, jsonError } from '@/lib/api-helpers'
import { rateLimit } from '@/lib/security'
import { logger } from '@/lib/logger'
import { sendPushToUser } from '@/lib/push-server'
import { clockParts, isDueNow } from '@/lib/reminder-clock'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET+POST /api/reminders/send
 *
 * Server-side dose push — works when the app is **closed**.
 *
 * Auth: Authorization: Bearer $CRON_SECRET
 *
 * Query:
 *   mode=tick     (default) only HH:MM due now or previous minute
 *   mode=catchup  all pending doses with time <= now today (daily safety net)
 *
 * Vercel Hobby can only run this once/day → use GitHub Actions or an
 * external cron (every 1–5 min) so closed-app users still get Web Push.
 * While the app is open, MedicationAlarmHost still rings on the minute.
 */
async function run(req: NextRequest) {
  const limited = rateLimit(req, 30, 60_000)
  if (limited) return limited

  const { response, user } = await requireSystemToken(req)
  if (response || !user) return response!

  // Default catchup so the daily Vercel Hobby cron (no query string) still
  // sweeps missed doses. GitHub Actions / external cron must pass ?mode=tick
  // for minute-accurate closed-app pushes.
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
              // Prisma can't OR on string equality cleanly without OR array
              OR: [{ time: clock.timeStr }, { time: clock.prevTimeStr }],
            }),
      },
      include: {
        medication: {
          include: {
            user: { select: { id: true, name: true } },
            familyMember: {
              include: { family: { select: { ownerId: true } } },
            },
          },
        },
      },
      take: 200,
    })

    // Extra filter for tick mode (in case prev day boundary edge cases)
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

    for (const reminder of dueReminders) {
      // Already pushed for this dose slot (reminderCount bumped on first send)
      if (reminder.reminderCount > 0) {
        skipped++
        continue
      }

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
        [dosage, frequency, reminder.time].filter(Boolean).join(' · ') ||
        `Reminder: take ${medName}`
      const title = `Time to take ${medName}`
      const dedupeKey = `dose:${reminder.id}`

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
        const push = await sendPushToUser(userId, {
          title,
          body,
          tag: `reminder-${reminder.id}`,
          url: '/patient',
        })
        // Mark as notified so catchup / re-ticks do not spam
        await db.reminder.update({
          where: { id: reminder.id },
          data: { reminderCount: { increment: 1 } },
        })
        if (push.sent > 0 || push.failed === 0) {
          sent++
        } else {
          // No subscription on device — still counted as processed
          sent++
        }
      } catch (e) {
        try {
          await db.reminder.update({
            where: { id: reminder.id },
            data: { reminderCount: { increment: 1 } },
          })
        } catch {
          /* ignore */
        }
        sent++
        logger.phiSafeError(e, 'reminder.push')
      }
    }

    return jsonOk({
      checked: true,
      mode,
      due: dueReminders.length,
      sent,
      skipped,
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
