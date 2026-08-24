import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireSystemToken, jsonError, jsonOk, checkConsent } from '@/lib/api-helpers'
import { rateLimit } from '@/lib/security'
import { sendNotification } from '@/lib/notifications'
export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://kynthai.app'

export async function GET(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!
  const u = user!

  const consentErr = checkConsent(u)
  if (consentErr) return consentErr

  const now = new Date()
  const windowHours = 72
  const windowEnd = new Date(now.getTime() + windowHours * 60 * 60 * 1000)

  // Quiet hours: 10 PM - 8 AM local time — do not return reminders in that window
  const quietStartHour = 22
  const quietEndHour = 8
  const quietStart = new Date(now)
  quietStart.setHours(quietStartHour, 0, 0, 0)
  const quietEnd = new Date(now)
  quietEnd.setHours(quietEndHour, 0, 0, 0)
  if (quietEnd <= quietStart) {
    quietEnd.setDate(quietEnd.getDate() + 1)
  }

  let appts: any[] = []
  if (u.role === 'patient') {
    appts = await db.appointment.findMany({
      where: {
        patientId: u.id,
        status: { in: ['pending', 'confirmed'] },
        scheduledAt: { gte: now, lte: windowEnd },
        deletedAt: null,
      },
      include: { doctor: { include: { user: true } } },
      orderBy: { scheduledAt: 'asc' },
    })
  } else if (u.role === 'doctor') {
    const profile = await db.doctorProfile.findUnique({ where: { userId: u.id } })
    if (!profile) return jsonOk([])
    appts = await db.appointment.findMany({
      where: {
        doctorId: profile.id,
        status: { in: ['pending', 'confirmed'] },
        scheduledAt: { gte: now, lte: windowEnd },
        deletedAt: null,
      },
      include: { patient: true },
      orderBy: { scheduledAt: 'asc' },
    })
  } else {
    return jsonError('Role not supported', 400)
  }

  const reminders = appts.map((a) => {
    const scheduledAt = a.scheduledAt
    const hide = scheduledAt >= quietStart && scheduledAt <= quietEnd
    return {
      id: a.id,
      scheduledAt: scheduledAt.toISOString(),
      type: a.type,
      status: a.status,
      doctorName: a.doctor?.user?.name ?? null,
      patientName: a.patient?.name ?? null,
      price: a.price,
      reason: a.reason ?? null,
      notes: a.notes ?? null,
      quietHoursHidden: hide,
    }
  })

  return jsonOk(reminders)
}

// POST /api/appointment-reminders — cron job to send email reminders for upcoming appointments
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 5, 60000)
  if (limited) return limited

  const { response, user } = await requireSystemToken(req)
  if (response || !user) return response!

  const now = new Date()
  const reminderWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000) // next 24 hours

  try {
    // Find appointments in the next 24 hours that haven't been reminded yet
    const upcomingAppts = await db.appointment.findMany({
      where: {
        status: { in: ['pending', 'confirmed'] },
        scheduledAt: { gte: now, lte: reminderWindow },
        deletedAt: null,
        // Only remind if no reminder sent in last 12 hours
        OR: [
          { lastReminderSentAt: null },
          { lastReminderSentAt: { lt: new Date(now.getTime() - 12 * 60 * 60 * 1000) } },
        ],
      },
      include: {
        patient: { select: { id: true, name: true, email: true } },
        doctor: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    })

    let sent = 0
    for (const appt of upcomingAppts) {
      const apptDate = appt.scheduledAt.toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
      })
      const apptType = appt.type === 'video' ? 'Video consultation' : 'In-person visit'
      const hoursUntil = Math.round((appt.scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60))

      // Notify patient
      await sendNotification(
        { userId: appt.patientId, email: appt.patient.email },
        {
          title: `Appointment in ${hoursUntil}h`,
          body: `Your ${apptType} with Dr. ${appt.doctor.user.name} is on ${apptDate}.\n\n` +
            `Reason: ${appt.reason || 'General consultation'}\n\n` +
            `Open Kynthai to prepare: ${APP_URL}/patient`,
          type: 'appointment_reminder',
          data: { appointmentId: appt.id, hoursUntil: String(hoursUntil) },
        }
      ).catch(() => {})

      // Notify doctor
      await sendNotification(
        { userId: appt.doctor.userId, email: appt.doctor.user.email },
        {
          title: `Appointment in ${hoursUntil}h`,
          body: `${appt.patient.name}'s ${apptType} is on ${apptDate}.\n\n` +
            `Reason: ${appt.reason || 'General consultation'}\n\n` +
            `Open Kynthai to prepare: ${APP_URL}/doctor`,
          type: 'appointment_reminder',
          data: { appointmentId: appt.id, patientId: appt.patientId },
        }
      ).catch(() => {})

      // Mark reminder as sent
      await db.appointment.update({
        where: { id: appt.id },
        data: { lastReminderSentAt: now },
      }).catch(() => {})

      sent++
    }

    return jsonOk({ appointmentsChecked: upcomingAppts.length, remindersSent: sent })
  } catch (error) {
    return jsonError('Failed to send reminders', 500)
  }
}
