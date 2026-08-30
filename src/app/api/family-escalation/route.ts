import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireAuthWithCsrf, jsonError, readJson, jsonOk } from '@/lib/api-helpers'
import { logAudit } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { sendNotification } from '@/lib/notifications'
export const dynamic = 'force-dynamic'

// POST /api/family-escalation — Trigger escalation for a missed dose
// GET /api/family-escalation — Get pending escalations for the user's family
// PATCH /api/family-escalation — Mark escalation as resolved

export async function GET(req: NextRequest) {
  const { response, user } = await requireAuth(req)
  if (response || !user) return response!

  // Audit: family escalation read
  await logAudit(user.id, 'family.escalation.list', { resourceType: 'EmergencyAlert' })

  try {
    // Get families where the user is a member
    const memberships = await db.familyMember.findMany({
      where: { userId: user.id },
      include: {
        family: {
          include: {
            members: {
              include: { user: { select: { id: true, name: true } } },
            },
          },
        },
      },
    })

    const familyIds = memberships.map((m: any) => m.familyId)

    // Get recent alerts for these families
    const alerts = await db.familyHealthAlert.findMany({
      where: {
        familyId: { in: familyIds },
        read: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ alerts })
  } catch (error) {
    logger.phiSafeError(error)
    return jsonError('Escalation failed', 500, 'ESCALATION_ERROR')
  }
}

export async function POST(req: NextRequest) {
  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!

  // Audit: family escalation creation
  await logAudit(user.id, 'family.escalation.create', { resourceType: 'EmergencyAlert' })
  try {
    const body = await readJson<{
      memberId?: string
      type?: string
      message?: string
      severity?: string
    }>(req)
    if (!body) return jsonError('Invalid JSON', 400)

    const { memberId, type = 'missed_dose', message, severity = 'warning' } = body

    if (!memberId || !message) {
      return jsonError('memberId and message are required', 400)
    }

    // Get the member's family
    const member = await db.familyMember.findUnique({
      where: { id: memberId },
      include: { family: true },
    })

    if (!member) {
      return jsonError('Family member not found', 404)
    }

    // Verify the user is part of this family
    const isMember = await db.familyMember.findFirst({
      where: {
        familyId: member.familyId,
        userId: user.id,
      },
    })

    if (!isMember) {
      return jsonError('Not authorized for this family', 403)
    }

    // Create the escalation alert
    const alert = await db.familyHealthAlert.create({
      data: {
        familyId: member.familyId,
        memberId,
        type,
        title: getAlertTitle(type),
        message,
        severity,
      },
    })

    // Route the alert through the shared policy so family portal users receive
    // one inbox entry plus all registered Web Push/FCM devices.
    try {
      const familyMembers = await db.familyMember.findMany({
        where: { familyId: member.familyId, userId: { not: user.id } },
        select: { userId: true },
      })
      await Promise.all(familyMembers.filter((fm) => !!fm.userId).map(async (fm) => {
        await sendNotification(
          { userId: fm.userId! },
          {
            title: getAlertTitle(type),
            body: message,
            type: `family_escalation_${type}`,
            data: { url: '/caretaker', memberId },
            dedupeKey: `family-alert:${alert.id}:${fm.userId}`,
          },
        )
      }))
    } catch (notificationError) {
      logger.phiSafeError(notificationError, 'family-escalation.notify')
    }

    return NextResponse.json({ alert })
  } catch (error) {
    logger.phiSafeError(error)
    return jsonError('Operation failed', 500, 'ESCALATION_ERROR')
  }
}

export async function PATCH(req: NextRequest) {
  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!

  try {
    const body = await readJson<{ alertId?: string }>(req)
    if (!body?.alertId) return jsonError('alertId is required', 400)

    const alert = await db.familyHealthAlert.findUnique({
      where: { id: body.alertId },
    })

    if (!alert) {
      return jsonError('Alert not found', 404)
    }

    // Verify the user is part of this family
    const isMember = await db.familyMember.findFirst({
      where: {
        familyId: alert.familyId,
        userId: user.id,
      },
    })

    if (!isMember) {
      return jsonError('Not authorized', 403)
    }

    await db.familyHealthAlert.update({
      where: { id: body.alertId },
      data: { read: true },
    })

    return jsonOk({ success: true })
  } catch (error) {
    logger.phiSafeError(error)
    return jsonError('Operation failed', 500, 'ESCALATION_ERROR')
  }
}

function getAlertTitle(type: string): string {
  const titles: Record<string, string> = {
    missed_dose: 'Missed Medication',
    streak: 'Streak Achievement',
    emergency: 'Emergency Alert',
    insight: 'Health Insight',
    escalation: 'Medication Escalation',
  }
  return titles[type] || 'Health Alert'
}
