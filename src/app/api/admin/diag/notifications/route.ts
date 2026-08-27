import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/diag/notifications
 *
 * Read-only notification-health snapshot for operators. Token-guarded with
 * the same SCHEMA_BOOTSTRAP_TOKEN secret as /api/admin/bootstrap-schema and
 * fails closed when the env var is unset. Returns AGGREGATE COUNTS ONLY —
 * no emails, names, ids, tokens, or any other PHI ever leaves this endpoint.
 *
 * Purpose: prove the closed-app reminder pipeline is healthy end-to-end:
 *   users (tz coverage) → push registrations (webpush + fcm) → reminder
 *   rows (pending/done) → notification_logs (what actually went out).
 */

type CountRow = { n: number | bigint }
type GrpRow = { k: string | null; n: number | bigint }

async function safeCount(sql: string): Promise<number | null> {
  try {
    const rows = await db.$queryRawUnsafe<CountRow[]>(sql)
    return Number(rows?.[0]?.n ?? 0)
  } catch {
    return null
  }
}

async function safeGroup(sql: string): Promise<Array<{ k: string; n: number }> | null> {
  try {
    const rows = await db.$queryRawUnsafe<GrpRow[]>(sql)
    return rows.map((r) => ({ k: r.k ?? 'unknown', n: Number(r.n) }))
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const expected = process.env.SCHEMA_BOOTSTRAP_TOKEN
  const provided = req.headers.get('authorization') ?? ''
  if (!expected || provided !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const out: Record<string, unknown> = { ok: true, generatedAt: new Date().toISOString() }

  // ── 1. Users + timezone coverage (drives per-user scheduling accuracy) ──
  out.usersTotal = await safeCount(`SELECT COUNT(*)::int AS n FROM "users"`)
  out.usersWithTimezone = await safeCount(
    `SELECT COUNT(*)::int AS n FROM "users" WHERE "timezone" IS NOT NULL AND "timezone" <> ''`
  )
  out.topTimezones = await safeGroup(
    `SELECT "timezone" AS k, COUNT(*)::int AS n FROM "users"
     WHERE "timezone" IS NOT NULL AND "timezone" <> ''
     GROUP BY 1 ORDER BY 2 DESC LIMIT 8`
  )

  // ── 2. Push registrations — the closed-app delivery surface ─────────────
  out.pushSubsTotal = await safeCount(`SELECT COUNT(*)::int AS n FROM "push_subscriptions"`)
  out.pushSubsByType = await safeGroup(
    `SELECT "type" AS k, COUNT(*)::int AS n FROM "push_subscriptions" GROUP BY 1`
  )
  out.pushSubsDistinctUsers = await safeCount(
    `SELECT COUNT(DISTINCT "userId")::int AS n FROM "push_subscriptions"`
  )

  // ── 3. Reminder rows in the last 24h by status ──────────────────────────
  // NOTE: the Reminder model has no @@map in schema.prisma, so depending on
  // how the database was created the physical table may be "reminders" or
  // the Prisma-default "Reminder". Probe once and reuse whichever exists.
  let remTable: 'reminders' | 'Reminder' | null = null
  const probe = await safeCount(`SELECT COUNT(*)::int AS n FROM "reminders"`)
  if (probe !== null) {
    remTable = 'reminders'
  } else if ((await safeCount(`SELECT COUNT(*)::int AS n FROM "Reminder"`)) !== null) {
    remTable = 'Reminder'
  }
  out.reminderTable = remTable ?? 'not-found'
  if (remTable) {
    out.reminders24hByStatus = await safeGroup(
      `SELECT "status" AS k, COUNT(*)::int AS n FROM "${remTable}"
       WHERE "date" >= NOW() - INTERVAL '24 hours' AND "deletedAt" IS NULL
       GROUP BY 1`
    )
    out.remindersPendingTotal = await safeCount(
      `SELECT COUNT(*)::int AS n FROM "${remTable}"
       WHERE "status" = 'pending' AND "deletedAt" IS NULL`
    )
  } else {
    out.reminders24hByStatus = null
    out.remindersPendingTotal = null
  }

  // ── 4. Notification traffic — what the engine actually delivered ────────
  out.notifs24hByChannel = await safeGroup(
    `SELECT "channel" AS k, COUNT(*)::int AS n FROM "notification_logs"
     WHERE "createdAt" >= NOW() - INTERVAL '24 hours' GROUP BY 1`
  )
  out.doseReminders24h = await safeCount(
    `SELECT COUNT(*)::int AS n FROM "notification_logs"
     WHERE "createdAt" >= NOW() - INTERVAL '24 hours' AND "type" = 'reminder'`
  )
  out.pushDeliveries24h = await safeCount(
    `SELECT COUNT(*)::int AS n FROM "notification_logs"
     WHERE "createdAt" >= NOW() - INTERVAL '24 hours' AND "channel" = 'push'`
  )
  try {
    const rows = await db.$queryRawUnsafe<Array<{ ts: Date | null }>>(
      `SELECT MAX("createdAt") AS ts FROM "notification_logs"`
    )
    out.lastNotificationAt = rows?.[0]?.ts ?? null
  } catch {
    out.lastNotificationAt = null
  }

  return Response.json(out)
}
