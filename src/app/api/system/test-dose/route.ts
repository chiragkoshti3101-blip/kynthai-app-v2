import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireSystemToken, jsonOk, jsonError } from '@/lib/api-helpers'
import { clockParts } from '@/lib/reminder-clock'
import { sendReminder } from '@/lib/notifications'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET/POST /api/system/test-dose
 * Auth: Bearer $CRON_SECRET
 * Creates (or reuses) a due-now pending reminder for patient@kynthai.app
 * and immediately runs sendReminder (push + email).
 */
async function run(req: NextRequest) {
  const { response, user } = await requireSystemToken(req)
  if (response || !user) return response!

  try {
    const email =
      req.nextUrl.searchParams.get('email') || 'patient@kynthai.app'
    const u = await db.user.findUnique({ where: { email } })
    if (!u) return jsonError(`User not found: ${email}`, 404)

    const clock = clockParts('Asia/Kolkata') // match user region for IST tests
    const date = new Date(clock.isoDate)
    const time = clock.timeStr

    let med = await db.medication.findFirst({
      where: { userId: u.id, active: true },
      orderBy: { createdAt: 'desc' },
    })
    if (!med) {
      med = await db.medication.create({
        data: {
          userId: u.id,
          name: 'Test Metformin',
          dosage: '500mg',
          times: time,
          frequency: 'As needed',
          active: true,
        },
      })
    }

    // Reset any same-minute row so we can re-fire
    await db.reminder.deleteMany({
      where: {
        medicationId: med.id,
        date,
        time,
      },
    })

    const reminder = await db.reminder.create({
      data: {
        medicationId: med.id,
        date,
        time,
        status: 'pending',
        reminderCount: 0,
      },
    })

    const route = await sendReminder(
      u.id,
      med.name || 'Medication',
      med.dosage || '',
      time,
      { email: u.email || undefined, phone: u.phone || undefined },
    )

    await db.reminder.update({
      where: { id: reminder.id },
      data: { reminderCount: { increment: 1 } },
    })

    return jsonOk({
      ok: true,
      userId: u.id,
      email: u.email,
      med: med.name,
      time,
      zone: 'Asia/Kolkata',
      delivered: route.delivered,
      channel: route.channel,
      results: route.results,
    })
  } catch (e) {
    logger.phiSafeError(e, 'system.test-dose')
    return jsonError('test-dose failed', 500)
  }
}

export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}
