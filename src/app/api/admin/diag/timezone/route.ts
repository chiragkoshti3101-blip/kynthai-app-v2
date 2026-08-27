import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/diag/timezone
 *
 * Operator-only timezone backfill for the reminder scheduler. Guarded by the
 * same SCHEMA_BOOTSTRAP_TOKEN secret as the other /api/admin/* routes and
 * fails closed when the env var is unset.
 *
 * Body (JSON):
 *   {
 *     "timezone": "Asia/Kolkata",      // required, must be a valid IANA zone
 *     "email":    "user@example.com",  // optional — target ONE user
 *     "allMissing": true               // optional — backfill every user whose
 *                                      //   timezone is NULL or empty
 *   }
 *
 * Exactly one of `email` / `allMissing` must be provided. SQL is fully
 * parameterized; the timezone value itself is validated as a real IANA zone
 * before it ever reaches the database. Returns only counts — no PHI.
 *
 * Why: scheduling accuracy depends on each user's stored IANA zone. Users who
 * have not logged in since the timezone-write fix have NULL → the scheduler
 * falls back to America/New_York, firing their doses hours late. This lets
 * the operator fix stored zones immediately (e.g. set all-missing accounts to
 * the correct zone) instead of waiting for each user's next login.
 */

const MAX_TZ_LEN = 64

function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > MAX_TZ_LEN) return false
  if (!/^[A-Za-z0-9_+\-.]+(\/[A-Za-z0-9_+\-.]+)*$/.test(tz)) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date())
    return true
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const expected = process.env.SCHEMA_BOOTSTRAP_TOKEN
  const provided = req.headers.get('authorization') ?? ''
  if (!expected || provided !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: { timezone?: unknown; email?: unknown; allMissing?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const tz = typeof body.timezone === 'string' ? body.timezone.trim() : ''
  if (!isValidTimeZone(tz)) {
    return Response.json(
      { ok: false, error: 'A valid IANA timezone is required (e.g. Asia/Kolkata)' },
      { status: 400 }
    )
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const allMissing = body.allMissing === true
  if (Boolean(email) === allMissing) {
    return Response.json(
      { ok: false, error: 'Provide exactly one of "email" or "allMissing": true' },
      { status: 400 }
    )
  }

  try {
    await db.$executeRawUnsafe(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" TEXT`
    )

    let updated: number
    if (email) {
      updated = await db.$executeRawUnsafe(
        `UPDATE "users" SET "timezone" = $1 WHERE LOWER("email") = $2`,
        tz,
        email
      )
    } else {
      updated = await db.$executeRawUnsafe(
        `UPDATE "users" SET "timezone" = $1 WHERE "timezone" IS NULL OR "timezone" = ''`,
        tz
      )
    }

    const rows = await db.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT COUNT(*)::int AS n FROM "users" WHERE "timezone" IS NOT NULL AND "timezone" <> ''`
    )
    return Response.json({
      ok: true,
      updated,
      usersWithTimezone: rows?.[0]?.n ?? null,
      scope: email ? `email:${email}` : 'allMissing',
    })
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'backfill failed' },
      { status: 500 }
    )
  }
}
