import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuthWithCsrf, requireAuth, jsonError, readJson, isUserMinor } from '@/lib/api-helpers'
import { logAudit } from '@/lib/auth'
import { sanitizeText } from '@/lib/security'
import { emergencySosSchema } from '@/lib/schemas/security'
import { sendSMSReal, isSMSEnabled } from '@/lib/integrations'
import { logger } from '@/lib/logger'
export const dynamic = 'force-dynamic'

// POST /api/emergency-sos — Trigger SOS alert to family members
// GET /api/emergency-sos — Get active SOS alerts for user's family

export async function POST(req: NextRequest) {
  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!

  // COMPLIANCE (COPPA/family governance): restricted-feature notice for minors.
  // Kynthai SOS is a self-harm/emergency alert tool; a minor's legal guardian
  // must be present or notified. This notice does not block the SOS (which
  // must never be blocked — emergency use supersedes age restrictions), but
  // surfaces a required guardian-disclosure flag so the platform can log the
  // minor-initiated alert and ensure guardian notification is attempted.
  const isMinor = isUserMinor(u)

  // Audit: emergency SOS alert creation
  await logAudit(user.id, 'emergency_sos.create', { resourceType: 'EmergencyAlert', outcome: 'success' })

  try {
    const rawBody = await readJson(req)
    if (!rawBody) return jsonError('Invalid JSON', 400, 'INVALID_JSON')
    const parsed = emergencySosSchema.safeParse(rawBody)
    if (!parsed.success) {
      const fields: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        fields[String(issue.path.join('.') || 'body')] = issue.message
      }
      return jsonError('Validation failed', 422, 'VALIDATION_ERROR', { fields })
    }
    const body = parsed.data

    const location    = sanitizeText(body.location, 300)
    const notes       = sanitizeText(body.notes, 1000)
    const medicalInfo = sanitizeText(body.medicalInfo, 1000)
    const emergencyNumber = sanitizeText(body.emergencyNumber, 20) || 'local'

    // Get user's family memberships
    const memberships = await db.familyMember.findMany({
      where: { userId: user.id },
      include: { family: true },
    })

    if (memberships.length === 0) {
      return jsonError('No family found. Please create or join a family first.', 400)
    }

    // Wrap all SOS mutations in a single atomic transaction so no alert is
    // partially persisted if something fails mid-way.
    const notifiedNames: string[] = []
    // Phone targets collected inside the transaction (linked user accounts) —
    // SMS reminders go out AFTER commit below, best-effort.
    const smsTargets: { name: string; phone: string }[] = []
    const alerts = await db.$transaction(async (tx): Promise<any[]> => {
      const created: any[] = []
      for (const membership of memberships) {
        const alert = await tx.emergencyAlert.create({
          data: {
            familyId: membership.familyId,
            familyMemberId: membership.id as string, // the member this alert is about
            memberName: user.name,
            reporterId: user.id,
            type: 'sos',
            tier: 'critical',
            location: location || null,
            notes: notes || null,
            status: 'active',
          } as any,
        })

        const familyMembers = await tx.familyMember.findMany({
          where: {
            familyId: membership.familyId,
            userId: { not: user.id },
          },
          include: { user: { select: { id: true, name: true, phone: true } } },
        })

        const membershipNotifiedIds: string[] = []
        for (const fm of familyMembers) {
          if (fm.userId) {
            membershipNotifiedIds.push(fm.userId)
            notifiedNames.push(fm.user?.name || 'A family member')
            if (fm.user?.phone) {
              smsTargets.push({ name: fm.user.name || 'Family member', phone: fm.user.phone })
            }
            await tx.notificationLog.create({
              data: {
                userId: fm.userId,
                channel: 'in-app',
                type: 'emergency_sos',
                title: `SOS Alert: ${user.name} needs help!`,
                body: body?.notes || `${user.name} has triggered an emergency SOS alert. Please check on them immediately.`,
                recipient: fm.userId,
                status: 'sent',
              },
            })

            await tx.familyHealthAlert.create({
              data: {
                familyId: membership.familyId,
                memberId: membership.id,
                type: 'emergency',
                title: `SOS: ${user.name} needs help`,
                message: notes || `${user.name} has triggered an emergency SOS alert. Please check on them immediately.${location ? ` Location: ${location}` : ''}`,
                severity: 'critical',
              },
            })
          }
        }

        await tx.emergencyAlert.update({
          where: { id: alert.id },
          data: { notifiedDoctors: JSON.stringify(membershipNotifiedIds) },
        })

        created.push(alert)
      }
      return created
    })

    // Best-effort SMS reminders to the contact numbers on file. The alert is
    // already committed — a failed SMS must never fail the SOS itself. Each
    // recipient is guarded individually so one bad number can't block the rest.
    // SMS content is deliberately NON-SENSITIVE (no notes/medical info) per the
    // Twilio channel boundary in src/lib/integrations.ts.
    let smsSent = 0
    if (smsTargets.length > 0 && isSMSEnabled()) {
      const base = `Kynthai SOS alert: ${user.name} needs help.`
      const where = location ? ` Location: ${location}.` : ''
      const tail = ` Please check on them right away. Kynthai cannot dispatch responders — contact local emergency services if needed.`
      for (const t of smsTargets) {
        try {
          const r = await sendSMSReal({ to: t.phone, body: base + where + tail })
          if (r.ok) {
            smsSent += 1
            await db.notificationLog
              .create({
                data: {
                  userId: undefined as any,
                  channel: 'sms',
                  type: 'emergency_sos',
                  title: `SOS reminder to ${t.name}`,
                  body: base + where + tail,
                  recipient: t.phone,
                  status: 'sent',
                  cost: 0,
                },
              })
              .catch(() => { /* analytics row is best-effort */ })
          } else {
            logger.warn('emergency-sos.sms_failed', { contact: t.name })
          }
        } catch (e) {
          // Never let a transport error fail the SOS alert itself.
          logger.phiSafeError(e, 'emergency-sos.sms_exception')
        }
      }
    }

    // Track notified contacts for the response — real family member names, no
    // fabricated responders or ETAs. The patient SOS UI renders this directly.
    const notifiedContacts = [...new Set(notifiedNames)].map((name) => ({ name }))

    return NextResponse.json({
      success: true,
      alertCount: alerts.length,
      message: 'SOS alert sent to all family members',
      emergencyNumber,
      notifiedDoctors: [],
      notifiedContacts,
      smsSent,
      summary: `${user.name} — SOS alert sent to your family and listed contacts${smsSent > 0 ? ` (${smsSent} reminder text sent)` : ''}. Contact emergency services at ${emergencyNumber} if this is life-threatening.`,
      ...(isMinor
        ? { minorNotice: 'Guardian notification attempted. A minor has triggered a SOS alert — guardian should respond immediately and contact emergency services if needed.' }
        : {}),
    })
  } catch (error) {
    // Security: never log raw emergency/medical data or DB errors
    logger.phiSafeError(error, 'emergency-sos.POST')
    return jsonError('Failed to send SOS', 500, 'SOS_ERROR')
  }
}

export async function GET(req: NextRequest) {
  // ponytail: GET is read-only — CSRF validation is for state-changing
  // methods only (POST/PATCH/DELETE). Requiring CSRF on GET breaks
  // browser prefetching and link prefetching.
  const { response, user } = await requireAuth(req)
  if (response || !user) return response!

  try {
    // Get families where the user is a member
    const memberships = await db.familyMember.findMany({
      where: { userId: user.id },
    })

    const familyIds = memberships.map((m: any) => m.familyId)

    // Get active SOS alerts
    const alerts = await db.emergencyAlert.findMany({
      where: {
        familyId: { in: familyIds },
        status: 'active',
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return NextResponse.json({ alerts })
  } catch (error) {
    // Security: never log raw DB errors containing user IDs/crisis data
    logger.phiSafeError(error, 'emergency-sos.GET')
    return jsonError('Failed', 500, 'INTERNAL_ERROR')
  }
}
