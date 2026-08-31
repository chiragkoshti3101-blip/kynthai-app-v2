import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireSystemToken, jsonOk, jsonError } from '@/lib/api-helpers'
import { rateLimit } from '@/lib/security'
import { logger } from '@/lib/logger'
import { sendReminder } from '@/lib/notifications'
import { clockParts, DEFAULT_TZ, isDueNow } from '@/lib/reminder-clock'
import { ensureTodayRemindersForAllActive } from '@/lib/ensure-reminders'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const FALLBACK_TZ = DEFAULT_TZ

type DirectFamily = {
  id: string
  ownerId: string
  members: { userId: string | null; role: string }[]
}

type ReminderWithOwner = {
  id: string
  date: Date
  time: string
  medication: {
    id: string
    name: string | null
    dosage: string | null
    active: boolean
    user: {
      id: string
      timezone: string | null
      memberships: { familyId: string }[]
    } | null
    familyMember: {
      userId: string | null
      family: {
        ownerId: string
        owner: { timezone: string | null }
        members: { userId: string | null; role: string }[]
      }
    } | null
  } | null
}

function safeClock(timezone: string | null | undefined, now: Date) {
  try {
    return clockParts(timezone || FALLBACK_TZ, now)
  } catch {
    return clockParts(FALLBACK_TZ, now)
  }
}

function utcDayOffset(now: Date, days: number): Date {
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + days,
  ))
}

function recipientsFor(
  medication: NonNullable<ReminderWithOwner['medication']>,
  directFamilies: Map<string, DirectFamily>,
): string[] {
  const recipients = new Set<string>()
  const family = medication.familyMember?.family
  const patientId = medication.familyMember?.userId

  if (family) {
    recipients.add(family.ownerId)
    if (patientId) recipients.add(patientId)
    for (const member of family.members) {
      if (member.userId && member.role === 'caretaker') recipients.add(member.userId)
    }
  } else if (medication.user?.id) {
    // A direct patient medication is delivered to that patient. Family members
    // are escalation recipients, not copies of every normal dose reminder.
    recipients.add(medication.user.id)
  }

  // Keep the argument useful for direct-family lookups when a legacy row has
  // no FamilyMember relation but its user is linked to a family.
  if (!family && medication.user?.id) {
    for (const membership of medication.user.memberships) {
      const linked = directFamilies.get(membership.familyId)
      if (!linked) continue
      // Only add an explicitly linked caretaker/owner for legacy rows; never
      // broadcast a direct patient dose to unrelated family members.
      if (linked.ownerId === medication.user.id) continue
    }
  }

  return [...recipients]
}

/**
 * Send due medication reminders for every owner’s local timezone.
 * Reminder rows carry a calendar date plus HH:MM; the owner’s stored IANA
 * timezone decides which row is due. The query spans nearby UTC dates because
 * users can be ahead of or behind the server date.
 */
async function run(req: NextRequest) {
  const limited = rateLimit(req, 60, 60_000)
  if (limited) return limited

  const { response, user } = await requireSystemToken(req)
  if (response || !user) return response!

  const mode = req.nextUrl.searchParams.get('mode') === 'tick' ? 'tick' : 'catchup'
  const now = new Date()

  try {
    const ensured = await ensureTodayRemindersForAllActive()
    const candidates = (await db.reminder.findMany({
      where: {
        date: { gte: utcDayOffset(now, -2), lte: utcDayOffset(now, 2) },
        status: 'pending',
        medication: { is: { active: true } },
      },
      include: {
        medication: {
          include: {
            user: {
              select: {
                id: true,
                timezone: true,
                memberships: { select: { familyId: true } },
              },
            },
            familyMember: {
              include: {
                family: {
                  select: {
                    ownerId: true,
                    owner: { select: { timezone: true } },
                    members: {
                      where: { inviteStatus: 'accepted', userId: { not: null } },
                      select: { userId: true, role: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 2000,
    })) as ReminderWithOwner[]

    const familyIds = [...new Set(
      candidates.flatMap((r) => r.medication?.user?.memberships.map((m) => m.familyId) || []),
    )]
    const directFamilies = familyIds.length
      ? await db.family.findMany({
          where: { id: { in: familyIds } },
          select: {
            id: true,
            ownerId: true,
            members: {
              where: { inviteStatus: 'accepted', userId: { not: null } },
              select: { userId: true, role: true },
            },
          },
        })
      : []
    const directFamilyMap = new Map(directFamilies.map((family) => [family.id, family]))

    let sent = 0
    let skipped = 0
    let failed = 0
    const channels: Record<string, number> = {}

    for (const reminder of candidates) {
      const medication = reminder.medication
      if (!medication) {
        failed++
        continue
      }

      const family = medication.familyMember?.family
      const ownerTimezone = family?.owner.timezone || medication.user?.timezone
      const ownerClock = safeClock(ownerTimezone, now)
      const rowDate = reminder.date.toISOString().slice(0, 10)

      // A reminder belongs to the owner-local calendar date. Never fire a
      // yesterday/tomorrow row merely because the HH:MM matches server time.
      if (rowDate !== ownerClock.dateStr) {
        skipped++
        continue
      }

      const due = mode === 'tick'
        ? isDueNow(reminder.time, ownerClock, 8)
        : reminder.time <= ownerClock.timeStr
      if (!due) {
        skipped++
        continue
      }

      const recipients = recipientsFor(medication, directFamilyMap)
      if (recipients.length === 0) {
        failed++
        continue
      }

      let reminderDelivered = false
      let recipientAttempted = false
      for (const recipientId of recipients) {
        const dedupeKey = `dose:${reminder.id}:${recipientId}`
        recipientAttempted = true
        try {
          const already = await db.notificationLog.findFirst({
            where: {
              userId: recipientId,
              channel: 'push',
              type: 'reminder',
              status: 'sent',
              // `body` is encrypted at rest and cannot support substring
              // matching; dedupeKey is the stable indexed event identifier.
              dedupeKey,
              createdAt: { gte: new Date(now.getTime() - 20 * 60 * 60 * 1000) },
            },
            select: { id: true },
          })
          if (already) {
            skipped++
            continue
          }
        } catch {
          // The central claim below remains the final concurrency guard.
        }

        try {
          const route = await sendReminder(
            recipientId,
            medication.name || 'your medication',
            medication.dosage || '',
            reminder.time,
            {},
            dedupeKey,
            { reminderId: reminder.id, medicationId: medication.id },
          )
          const channel = route.channel || 'none'
          channels[channel] = (channels[channel] || 0) + 1
          if (route.delivered) reminderDelivered = true
          else if (!route.notificationLogId) failed++
        } catch (error) {
          failed++
          logger.phiSafeError(error, 'reminder.multiChannel')
        }
      }

      if (reminderDelivered) {
        sent++
        await db.reminder.update({
          where: { id: reminder.id },
          data: { reminderCount: { increment: 1 } },
        }).catch(() => {})
      } else if (!recipientAttempted) {
        failed++
      }
    }

    return jsonOk({
      checked: true,
      mode,
      due: candidates.length,
      sent,
      skipped,
      failed,
      ensured,
      channels,
      timezoneAware: true,
      serverTime: now.toISOString(),
    })
  } catch (error) {
    logger.phiSafeError(error, 'reminder.send')
    return jsonError('Internal server error', 500)
  }
}

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}
