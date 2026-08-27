import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireSystemToken, jsonOk, jsonError } from '@/lib/api-helpers'
import { rateLimit } from '@/lib/security'
import { logger } from '@/lib/logger'
import { sendReminder } from '@/lib/notifications'
import { clockParts, isDueNow, nearbyTimeStrings } from '@/lib/reminder-clock'
import { parseTimes } from '@/lib/parse-times'
import { ensureTodayRemindersForAllActive } from '@/lib/ensure-reminders'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Asia/Kolkata',
  'UTC',
]

function dayUtc(dateStr: string) {
  // Must match todayStr()/toISODateTime used when creating reminder rows
  return new Date(`${dateStr}T00:00:00.000Z`)
}

// ---------------------------------------------------------------------------
// PER-USER TIMEZONE SUPPORT
//
// Previously every reminder fired on New York wall-clock time regardless of
// where the user lives (a 08:00 dose fired at 08:00 ET = 05:00 PT). We now
// store each user's IANA timezone in User.timezone and gate each reminder on
// the OWNER's local clock.
//
// The column is bootstrapped idempotently here (same pattern as the
// push_subscriptions bootstrap in /api/notifications/subscribe) so this works
// before a migration is applied. All access uses raw SQL so the endpoint keeps
// working even if Prisma Client has not been regenerated yet.
// ---------------------------------------------------------------------------
const FALLBACK_TZ = 'America/New_York'
let userTzColumnReady: boolean | null = null // null = not checked yet

async function ensureUserTimezoneColumn(): Promise<void> {
  if (userTzColumnReady !== null) return
  try {
    await db.$executeRawUnsafe(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" TEXT`
    )
    userTzColumnReady = true
  } catch (e) {
    logger.phiSafeError(e, 'reminder.ensureTzColumn')
    userTzColumnReady = false // degrade to legacy multi-zone behaviour
  }
}

/** Look up stored timezones for the given user ids. Missing/blank → fallback. */
async function loadUserTimezones(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (userTzColumnReady !== true || userIds.length === 0) return map
  const unique = [...new Set(userIds.filter(Boolean))]
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100)
    const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(',')
    try {
      const rows = await db.$queryRawUnsafe<Array<{ id: string; timezone: string | null }>>(
        `SELECT id, timezone FROM "users" WHERE id IN (${placeholders})`,
        ...chunk
      )
      for (const row of rows) {
        if (row?.timezone && typeof row.timezone === 'string' && row.timezone.trim()) {
          map.set(row.id, row.timezone.trim())
        }
      }
    } catch (e) {
      // Column might be missing on a cold deploy — flip to degraded mode.
      logger.phiSafeError(e, 'reminder.loadTz')
      userTzColumnReady = false
      return map
    }
  }
  return map
}

async function run(req: NextRequest) {
  const limited = rateLimit(req, 60, 60_000)
  if (limited) return limited

  const { response, user } = await requireSystemToken(req)
  if (response || !user) return response!

  const modeParam = req.nextUrl.searchParams.get('mode')
  const mode = modeParam === 'tick' ? 'tick' : 'catchup'
  const primary = clockParts('America/New_York')

  try {
    const ensured = await ensureTodayRemindersForAllActive()
    await ensureUserTimezoneColumn()

    const seen = new Set<string>()
    const dueReminders: any[] = []
    // Owners seen in this batch — used to load per-user timezones.
    const ownerIds: string[] = []

    for (const tz of ZONES) {
      const clock = clockParts(tz)
      const dates = [dayUtc(clock.dateStr)]
      if (clock.prevDateStr !== clock.dateStr) dates.push(dayUtc(clock.prevDateStr))

      const candidates = await db.reminder.findMany({
        where: {
          date: { in: dates },
          status: 'pending',
          ...(mode === 'catchup'
            ? { time: { lte: clock.timeStr } }
            : { time: { in: nearbyTimeStrings(tz, new Date(), 8) } }),
        },
        include: {
          medication: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  emailOptOut: true,
                },
              },
              familyMember: {
                include: {
                  family: {
                    select: {
                      ownerId: true,
                      owner: {
                        select: { id: true, name: true, email: true, phone: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        take: 200,
      })

      for (const r of candidates) {
        if (seen.has(r.id)) continue
        // Superset prefilter only — final due-ness is decided per-OWNER timezone
        // in the firing loop below (owner tz beats zone loop).
        const ownerId =
          r.medication?.user?.id || r.medication?.familyMember?.family?.ownerId
        if (ownerId) ownerIds.push(ownerId)
        seen.add(r.id)
        dueReminders.push(r)
      }
    }

    // Fallback: active medications whose times are due even if reminder rows lagged
    if (dueReminders.length === 0 && mode === 'tick') {
      const meds = await db.medication.findMany({
        where: { active: true },
        include: {
          user: {
            select: { id: true, name: true, email: true, phone: true, emailOptOut: true },
          },
          familyMember: {
            include: {
              family: {
                select: {
                  ownerId: true,
                  owner: { select: { id: true, name: true, email: true, phone: true } },
                },
              },
            },
          },
        },
        take: 500,
      })
      for (const tz of ZONES) {
        const clock = clockParts(tz)
        for (const med of meds) {
          for (const t of parseTimes(med.times)) {
            if (!isDueNow(t, clock, 8)) continue
            const fakeId = `med:${med.id}:${clock.dateStr}:${t}`
            if (seen.has(fakeId)) continue
            seen.add(fakeId)
            const medOwnerId = med.user?.id || med.familyMember?.family?.ownerId
            if (medOwnerId) ownerIds.push(medOwnerId)
            dueReminders.push({
              id: fakeId,
              time: t,
              reminderCount: 0,
              date: dayUtc(clock.dateStr),
              medication: med,
            })
          }
        }
      }
    }

    if (dueReminders.length === 0) {
      return jsonOk({
        checked: true,
        mode,
        sent: 0,
        skipped: 0,
        ensured,
        message: 'No reminders due',
        time: primary.timeStr,
        date: primary.dateStr,
        zones: ZONES,
      })
    }

    let sent = 0
    let skipped = 0
    let failed = 0
    const channels: Record<string, number> = {}

    // Resolve per-owner timezones once for this batch.
    const tzMap = await loadUserTimezones(ownerIds)

    for (const reminder of dueReminders) {
      const medUser = reminder.medication?.user
      const familyOwner = reminder.medication?.familyMember?.family?.owner
      const userId: string | null =
        medUser?.id || reminder.medication?.familyMember?.family?.ownerId || null
      if (!userId) {
        failed++
        continue
      }

      // PER-USER TIMEZONE GATE: fire on the OWNER's local wall clock, not the
      // zone-loop clock. Falls back to America/New_York when no tz is stored.
      const ownerTz = tzMap.get(userId) || FALLBACK_TZ
      const ownerClock = clockParts(ownerTz)
      const dueForOwner =
        mode === 'tick'
          ? isDueNow(String(reminder.time), ownerClock, 8)
          : String(reminder.time) <= ownerClock.timeStr
      if (!dueForOwner) {
        // Not yet due where this user lives — skip quietly.
        skipped++
        continue
      }

      const medName = reminder.medication?.name || 'your medication'
      const dosage = reminder.medication?.dosage || ''
      const bodyBits = [dosage, reminder.medication?.frequency || '', reminder.time]
        .filter(Boolean)
        .join(' · ')
      const body = bodyBits || `Reminder: take ${medName}`
      const title = `Time to take ${medName}`

      try {
        // Dedupe on title (med name) + body containing the scheduled time.
        // Window is 20h (not 30 min) so that a frequently-running tick cron
        // (cron-job.org every minute / */10 backups) sends each dose at most
        // ONCE per day, while still allowing the same HH:MM tomorrow. A 20h
        // window can never swallow the next day's dose (that is ≥23h away),
        // and distinct HH:MM strings never collide as substrings.
        const already = await db.notificationLog.findFirst({
          where: {
            userId,
            type: 'reminder',
            title,
            body: { contains: String(reminder.time) },
            createdAt: { gte: new Date(Date.now() - 20 * 60 * 60 * 1000) },
          },
          select: { id: true },
        })
        if (already) {
          skipped++
          continue
        }
      } catch {
        /* continue */
      }

      try {
        const route = await sendReminder(
          userId,
          String(medName),
          String(dosage || body),
          String(reminder.time),
          {
            email: medUser?.email || familyOwner?.email || undefined,
            phone: medUser?.phone || familyOwner?.phone || undefined,
          },
        )
        const ch = route.channel || 'none'
        channels[ch] = (channels[ch] || 0) + 1

        if (route.delivered) {
          sent++
          if (typeof reminder.id === 'string' && !String(reminder.id).startsWith('med:')) {
            await db.reminder
              .update({
                where: { id: reminder.id },
                data: { reminderCount: { increment: 1 } },
              })
              .catch(() => {})
          }
        } else {
          // Keep pending so the next tick can retry (e.g. no push sub yet)
          failed++
        }
      } catch (e) {
        failed++
        logger.phiSafeError(e, 'reminder.multiChannel')
      }
    }

    return jsonOk({
      checked: true,
      mode,
      due: dueReminders.length,
      sent,
      skipped,
      failed,
      ensured,
      channels,
      time: primary.timeStr,
      date: primary.dateStr,
      zones: ZONES,
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
