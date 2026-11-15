import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireOperatorToken } from '@/lib/operator-token'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/bootstrap-schema
 *
 * One-time, token-guarded schema bootstrap. Runs ONLY fixed, additive,
 * idempotent DDL statements — no user input ever reaches the SQL layer:
 *
 *   ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" TEXT
 *   ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "state" TEXT
 *   ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "state" TEXT
 *
 * Why this exists: the timezone field was added to the Prisma schema before
 * the column existed in Postgres, so every typed Prisma User query fails
 * with P2022 in production. The in-app self-heal (reminders/send +
 * user/timezone) only runs behind auth/cron gates that are themselves
 * unreachable until the column exists — a chicken-and-egg situation.
 * This endpoint breaks the deadlock: it is reachable unauthenticated and
 * uses raw SQL only (no typed field access), so it works even while the
 * column is missing.
 *
 * Auth: Authorization: Bearer ${SCHEMA_BOOTSTRAP_TOKEN} — fails closed when
 * the env var is unset, compared in constant time, and rate-limited so the
 * token cannot be brute-forced. Deliberately a GET: the edge middleware only
 * enforces CSRF on state-changing methods, and the statements are idempotent.
 * Disable after the migration by unsetting SCHEMA_BOOTSTRAP_TOKEN.
 */
export async function GET(req: NextRequest) {
  const unauthorized = requireOperatorToken(req)
  if (unauthorized) return unauthorized

  try {
    await db.$executeRawUnsafe(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" TEXT`
    )
    // Telemedicine state-licensing enforcement columns (idempotent).
    await db.$executeRawUnsafe(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "state" TEXT`
    )
    await db.$executeRawUnsafe(
      `ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "state" TEXT`
    )
    const rows = await db.$queryRawUnsafe>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'users' AND column_name = 'timezone'`
    )
    return Response.json({ ok: true, column: rows[0] ?? null })
  } catch (e) {
    return Response.json(
      { ok: false, error: process.env.NODE_ENV === 'production' ? 'bootstrap failed' : (e instanceof Error ? e.message : 'bootstrap failed') },
      { status: 500 }
    )
  }
}
