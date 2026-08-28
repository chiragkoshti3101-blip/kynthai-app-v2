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

  // ── 3. Reminder rows ────────────────────────────────────────────────────
  // CRITICAL: the Reminder model has no @@map, so Prisma Client reads/writes
  // the Prisma-default table "Reminder". An empty snake_case "reminders"
  // table ALSO exists in this database (legacy bootstrap artifact). Report
  // BOTH so the real store is never confused with the decoy.
  const remindersSnake = await safeCount(`SELECT COUNT(*)::int AS n FROM "reminders"`)
  const remindersPascal = await safeCount(`SELECT COUNT(*)::int AS n FROM "Reminder"`)
  out.tableRemindersSnake = remindersSnake
  out.tableReminderPascal = remindersPascal
  let remTable: 'reminders' | 'Reminder' | null = null
  // Prefer the table that actually has rows; fall back to Prisma default.
  if (remindersPascal !== null && remindersPascal > 0) remTable = 'Reminder'
  else if (remindersSnake !== null && remindersSnake > 0) remTable = 'reminders'
  else if (remindersPascal !== null) remTable = 'Reminder'
  else if (remindersSnake !== null) remTable = 'reminders'
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
    // Drift diagnostics: full-table truth + physical columns. If the table
    // is empty while dose sends happen via the synthetic fallback, these
    // reveal whether reminder-row creation is silently failing.
    out.remindersTotalRows = await safeCount(
      `SELECT COUNT(*)::int AS n FROM "${remTable}"`
    )
    out.remindersAllByStatus = await safeGroup(
      `SELECT "status" AS k, COUNT(*)::int AS n FROM "${remTable}" GROUP BY 1`
    )
    out.remindersDateRange = await safeCount(
      `SELECT 1 AS n FROM "${remTable}" WHERE "date" IS NOT NULL`
    ) !== null
      ? (
          await db
            .$queryRawUnsafe<Array<{ mn: Date | null; mx: Date | null }>>(
              `SELECT MIN("date") AS mn, MAX("date") AS mx FROM "${remTable}"`
            )
            .catch(() => [{ mn: null, mx: null }])
        )[0]
      : null
    const colRows = await safeGroup(
      `SELECT column_name AS k, 1 AS n FROM information_schema.columns
       WHERE table_name = '${remTable}' ORDER BY ordinal_position`
    )
    out.reminderColumns = colRows ? colRows.map((x) => x.k) : null
  } else {
    out.reminders24hByStatus = null
    out.remindersPendingTotal = null
  }

  // ── 3b. Medications — the fuel for the whole pipeline ───────────────────
  out.medicationsTotal = await safeCount(`SELECT COUNT(*)::int AS n FROM "medications"`)
  out.medicationsActive = await safeCount(
    `SELECT COUNT(*)::int AS n FROM "medications" WHERE "active" = true`
  )

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
