import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/bootstrap-schema
 *
 * One-time, token-guarded schema bootstrap. Runs ONLY a fixed, additive,
 * idempotent DDL statement — no user input ever reaches the SQL layer:
 *
 *   ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" TEXT
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
 * the env var is unset. Deliberately a GET: the edge middleware only enforces
 * CSRF on state-changing methods, and the statement is idempotent.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.SCHEMA_BOOTSTRAP_TOKEN
  const provided = req.headers.get('authorization') ?? ''
  if (!expected || provided !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await db.$executeRawUnsafe(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" TEXT`
    )
    const rows = await db.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'users' AND column_name = 'timezone'`
    )
    return Response.json({ ok: true, column: rows[0] ?? null })
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'bootstrap failed' },
      { status: 500 }
    )
  }
}
