import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { rateLimit } from '@/lib/security'
import { ensureTodayRemindersForAllActive } from '@/lib/ensure-reminders'
import { requireSystemToken, jsonOk, jsonError } from '@/lib/api-helpers'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * POST /api/reminders/schedule
 *
 * System-only backfill for active medication reminder rows. The medication’s
 * prescribed HH:MM values are never rewritten: rows are created for each
 * owner’s stored IANA calendar date, and /api/reminders/send decides when the
 * row is due in that owner’s local timezone.
 */
export async function GET(req: NextRequest) {
  return POST(req)
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 10, 60_000)
  if (limited) return limited

  const { response, user } = await requireSystemToken(req)
  if (response || !user) return response!

  try {
    const medicationsScanned = await db.medication.count({ where: { active: true } })
    const remindersCreated = await ensureTodayRemindersForAllActive()
    await logAudit(
      user.id,
      'reminder.schedule',
      `created=${remindersCreated} meds=${medicationsScanned}`,
    )
    return jsonOk({
      medicationsScanned,
      remindersCreated,
      timezoneAware: true,
    })
  } catch (error) {
    logger.phiSafeError(error, 'reminder.schedule')
    return jsonError('Internal server error', 500)
  }
}
