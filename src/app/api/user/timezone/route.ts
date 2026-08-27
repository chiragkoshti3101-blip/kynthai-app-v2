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
 * The `User.timezone` column is bootstrapped idempotently here AND in
 * /api/reminders/send, using raw SQL, so this works even before
 * `prisma db push` / migrations run and even if Prisma Client has not been
 * regenerated (raw SQL only — no typed field access).
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

async function ensureTimezoneColumn(): Promise<boolean> {
  try {
    await db.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "timezone" TEXT`)
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

  const ok = await ensureTimezoneColumn()
  if (!ok) return jsonError('Could not store timezone right now', 500)

  try {
    await db.$executeRawUnsafe(`UPDATE "User" SET "timezone" = $1 WHERE id = $2`, tz, user.id)
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

  const ok = await ensureTimezoneColumn()
  if (!ok) return jsonOk({ timezone: null })

  try {
    const rows = await db.$queryRawUnsafe<Array<{ timezone: string | null }>>(
      `SELECT timezone FROM "User" WHERE id = $1`,
      user.id
    )
    return jsonOk({ timezone: rows?.[0]?.timezone ?? null })
  } catch {
    return jsonOk({ timezone: null })
  }
}
