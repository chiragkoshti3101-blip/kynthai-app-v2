import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuthWithCsrf, jsonError, jsonOk, readJson } from '@/lib/api-helpers'
import { logAudit } from '@/lib/auth'
import { rateLimit } from '@/lib/security'

export const dynamic = 'force-dynamic'

/**
 * PUT /api/user/timezone
 *
 * Stores the authenticated user's IANA timezone so the reminder cron can fire
 * doses on the user's local wall clock (a 08:00 dose fires at 08:00 where the
 * user lives — not 08:00 New York time).
 *
 * Reads and writes use the database adapter; the timezone column must be
 * installed by the database migrations.
 *
 * Client usage (once per session, from auth-guard):
 *   Intl.DateTimeFormat().resolvedOptions().timeZone  →  e.g. "America/Los_Angeles"
 */

const MAX_TZ_LEN = 64

function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > MAX_TZ_LEN) return false
  // Must be a sane identifier: letters/digits, `_`, `/`, `+`, `-`, `.`
  if (!/^[A-Za-z0-9_+\-.]+(\/[A-Za-z0-9_+\-.]+)*$/.test(tz)) return false
  try {
    // Throws RangeError for non-IANA strings like "Not/AZone"
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date())
    return true
  } catch {
    return false
  }
}

export async function PUT(req: NextRequest) {
  const limited = rateLimit(req, 20, 60_000)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!

  const body = await readJson<{ timezone?: string }>(req)
  const tz = String(body?.timezone ?? '').trim()
  if (!isValidTimeZone(tz)) {
    return jsonError('A valid IANA timezone is required (e.g. America/Los_Angeles)', 400)
  }

  try {
    await db.user.update({ where: { id: user.id }, data: { timezone: tz } })
  } catch {
    return jsonError('Could not store timezone right now', 500)
  }

  await logAudit(user.id, 'user.timezone.set', tz)
  return jsonOk({ success: true, timezone: tz })
}

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, 20, 60_000)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!

  try {
    const storedUser = await db.user.findUnique({
      where: { id: user.id },
      select: { timezone: true },
    })
    return jsonOk({ timezone: storedUser?.timezone ?? null })
  } catch {
    return jsonOk({ timezone: null })
  }
}
