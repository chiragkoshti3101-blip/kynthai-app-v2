import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { rateLimit } from '@/lib/security'
import {
  requireAuthWithCsrf,
  requireSystemToken,
  jsonError,
  jsonOk,
  checkConsent,
} from '@/lib/api-helpers'
import { sendNotification } from '@/lib/notifications'
import { clockParts, DEFAULT_TZ } from '@/lib/reminder-clock'

export const dynamic = 'force-dynamic'

const ESCALATION_GRACE_MINUTES = 15

type SweepOptions = { scopeUserId?: string }

function safeClock(timezone: string | null | undefined, now: Date) {
  try {
    return clockParts(timezone || DEFAULT_TZ, now)
  } catch {
    return clockParts(DEFAULT_TZ, now)
  }
}

function dayNumber(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number)
  return Date.UTC(year || 1970, (month || 1) - 1, day || 1) / 86_400_000
}

function minutesSinceScheduled(rowDate: string, scheduledTime: string, clock: ReturnType<typeof clockParts>): number {
  const [hour, minute] = scheduledTime.split(':').map(Number)
  const scheduledMinutes = (hour || 0) * 60 + (minute || 0)
  const nowMinutes = Number(clock.timeStr.slice(0, 2)) * 60 + Number(clock.timeStr.slice(3, 5))
  return (dayNumber(clock.dateStr) - dayNumber(rowDate)) * 1440 + nowMinutes - scheduledMinutes
}

async function runEscalationSweep({ scopeUserId }: SweepOptions = {}) {
  const now = new Date()
  const scope = scopeUserId
    ? {
        OR: [
          { userId: scopeUserId },
          { familyMember: { family: { ownerId: scopeUserId } } },
        ],
      }
    : undefined

  const reminders = await db.reminder.findMany({
    where: {
      status: 'pending',
      escalated: false,
      date: { gte: new Date(now.getTime() - 2 * 86_400_000), lte: new Date(now.getTime() + 86_400_000) },
      medication: {
        is: {
          active: true,
          ...(scope ? scope : {}),
        },
      },
    },
    include: {
      medication: {
        include: {
          user: { select: { id: true, name: true, timezone: true } },
          familyMember: {
            include: {
              family: {
                select: {
                  ownerId: true,
                  owner: { select: { id: true, name: true, timezone: true } },
                  members: {
                    where: { inviteStatus: 'accepted', userId: { not: null } },
                    select: { userId: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { date: 'asc' },
    take: 2000,
  })

  // Direct patient medications may also belong to a family. Load those
  // relationships in one batch so caretakers receive the same escalation.
  const directUserIds = [...new Set(
    reminders
      .map((r) => r.medication?.user?.id)
      .filter((id): id is string => !!id),
  )]
  const directFamilies = directUserIds.length
    ? await db.family.findMany({
        where: { members: { some: { userId: { in: directUserIds }, inviteStatus: 'accepted' } } },
        select: {
          ownerId: true,
          members: {
            where: { inviteStatus: 'accepted', userId: { not: null } },
            select: { userId: true },
          },
        },
      })
    : []

  let escalated = 0
  let skipped = 0
  let failed = 0

  for (const reminder of reminders) {
    const medication = reminder.medication
    if (!medication) {
      failed++
      continue
    }

    const ownerTimezone = medication.familyMember?.family.owner.timezone || medication.user?.timezone
    const clock = safeClock(ownerTimezone, now)
    const rowDate = reminder.date.toISOString().slice(0, 10)
    const overdueMinutes = minutesSinceScheduled(rowDate, reminder.time, clock)

    // Only escalate the owner-local row after the grace period and never carry
    // an old pending row forward indefinitely.
    if (overdueMinutes < ESCALATION_GRACE_MINUTES || overdueMinutes > 26 * 60) {
      skipped++
      continue
    }

    const recipientIds = new Set<string>()
    if (medication.user?.id) recipientIds.add(medication.user.id)
    const family = medication.familyMember?.family
    if (family) {
      recipientIds.add(family.ownerId)
      for (const member of family.members) if (member.userId) recipientIds.add(member.userId)
    } else if (medication.user?.id) {
      for (const candidate of directFamilies) {
        const belongsToPatient = candidate.members.some((member) => member.userId === medication.user?.id)
        if (!belongsToPatient) continue
        recipientIds.add(candidate.ownerId)
        for (const member of candidate.members) if (member.userId) recipientIds.add(member.userId)
      }
    }

    const medName = medication.name || 'your medication'
    let attempted = false
    for (const recipientId of recipientIds) {
      attempted = true
      const isPatient = recipientId === medication.user?.id
      const result = await sendNotification(
        { userId: recipientId },
        {
          title: isPatient ? 'Missed dose — please take now' : 'Family member missed a dose',
          body: isPatient
            ? `Your ${medName} reminder at ${reminder.time} was missed. Please take it now or mark it as skipped.`
            : `A family member missed ${medName} at ${reminder.time}. You may want to reach out.`,
          type: 'reminder_escalation',
          data: {
            medicationId: medication.id,
            reminderId: reminder.id,
            scheduledTime: reminder.time,
            url: isPatient ? '/patient' : '/caretaker',
          },
          dedupeKey: `dose-escalation:${reminder.id}:${recipientId}`,
        },
      ).catch(() => ({
        delivered: false,
        channel: 'none' as const,
        cost: 0,
        results: [],
        notificationLogId: undefined,
      }))
      if (!result.delivered && !result.notificationLogId) failed++
    }

    if (!attempted) {
      failed++
      continue
    }

    // Mark only after fan-out. If a provider is temporarily unavailable the
    // next scheduler tick can retry; dedupe claims prevent duplicate sends.
    const updated = await db.reminder.updateMany({
      where: { id: reminder.id, escalated: false },
      data: { escalated: true, escalatedAt: now, reminderCount: { increment: 1 } },
    }).catch(() => ({ count: 0 }))
    if (updated.count === 1) escalated++
  }

  return { checked: reminders.length, escalated, skipped, failed }
}

/**
 * POST /api/reminders/escalate
 *
 * Browser sessions may run a scoped sweep for their own/family reminders. A
 * CRON_SECRET bearer may run the complete production sweep across all users.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 30, 60_000)
  if (limited) return limited

  const authHeader = req.headers.get('authorization') || ''
  const hasSystemBearer = authHeader.startsWith('Bearer ')
  if (hasSystemBearer) {
    const { response, user } = await requireSystemToken(req)
    if (response || !user) return response!
    try {
      const result = await runEscalationSweep()
      await logAudit(user.id, 'reminder.escalate.cron', result)
      return jsonOk({ ...result, system: true, timezoneAware: true })
    } catch (error) {
      return jsonError('Internal server error', 500)
    }
  }

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const consentErr = checkConsent(user)
  if (consentErr) return consentErr

  try {
    const result = await runEscalationSweep({ scopeUserId: user.id })
    if (result.escalated > 0) await logAudit(user.id, 'reminder.escalate', result)
    return jsonOk(result)
  } catch (error) {
    return jsonError('Internal server error', 500)
  }
}
