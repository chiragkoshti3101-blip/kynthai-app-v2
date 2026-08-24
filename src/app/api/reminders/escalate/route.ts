import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { rateLimit } from '@/lib/security'
import { requireAuth, requireAuthWithCsrf, jsonError, jsonOk, audit, checkConsent } from '@/lib/api-helpers'
import { sendEscalation, sendNotification } from '@/lib/notifications'
import { sendPushToUser } from '@/lib/push-server'
import { todayStr } from '@/lib/utils'
export const dynamic = 'force-dynamic'

// POST /api/reminders/escalate
// Checks overdue reminders for the caller's patients/family members and notifies caretakers.
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 30, 60000)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!

  const consentErr = checkConsent(u)
  if (consentErr) return consentErr

  const today = todayStr()
  const now = new Date()
  // "Overdue" = pending reminder whose time slot has passed (time is HH:MM).
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  // Find overdue reminders on medications owned by this user or their family members.
  const meds = await db.medication.findMany({
    where: {
      active: true,
      OR: [
        { userId: u.id },
        { familyMember: { family: { ownerId: u.id } } },
      ],
    },
  })
  const medIds = meds.map((m) => m.id)

  if (medIds.length === 0) return jsonOk({ escalated: 0 })

  const overdue = await db.reminder.findMany({
    where: {
      date: today,
      time: { lt: currentTime },
      status: 'pending',
      escalated: false,
      medicationId: { in: medIds },
    },
    include: { medication: true },
  })

  let escalated = 0
  for (const r of overdue) {
    await db.reminder.update({
      where: { id: r.id },
      data: { escalated: true, escalatedAt: new Date(), reminderCount: { increment: 1 } },
    })

    const medName = r.medication?.name ?? 'your medication'
    const scheduledTime = r.time
    const patientId = r.medication?.userId ?? null

    // Intent log — kept for analytics (always written to the caller's account).
    try {
      await db.notificationLog.create({
        data: {
          userId: u.id,
          channel: 'in-app',
          type: 'reminder_escalation',
          title: 'Missed medication reminder',
          body: `${medName} scheduled at ${scheduledTime} was missed. Please take it now or mark as skipped.`,
          recipient: u.email,
          status: 'sent',
          cost: 0,
        },
      })
    } catch { /* ignore */ }

    // Best-effort: deliver the escalation by in-app/email only.
    // - If the medication belongs to a user (the patient), sendEscalation() also
    //   notifies the caretaker (the caller) when caretakerId differs from patientId.
    try {
      if (patientId) {
        await sendPushToUser(patientId, {
          title: 'Missed medication reminder',
          body: `${medName} was scheduled at ${scheduledTime} — take it now or mark it as skipped.`,
          tag: `missed-${r.id}`,
          url: '/patient',
        })
      }
    } catch { /* best-effort */ }
    // - If the medication belongs to a family member without a user account
    //   (patientId is null), fall back to notifying the caretaker directly by email.
    try {
      if (patientId) {
        const caretakerId = patientId !== u.id ? u.id : null
        await sendEscalation(patientId, medName, scheduledTime, caretakerId)
      } else {
        await sendNotification(
          { userId: u.id, email: u.email, phone: null },
          {
            title: 'Family member missed a dose',
            body: `Your family member missed ${medName} at ${scheduledTime}. You may want to reach out.`,
            type: 'escalation',
            data: { medName, scheduledTime },
          },
        )
      }
    } catch { /* best-effort — sendNotification logs internally */ }

    escalated += 1
  }

  if (escalated > 0) {
    await logAudit(u.id, 'reminder.escalate', `escalated=${escalated}`)
  }

  return jsonOk({ escalated, checked: overdue.length })
}
