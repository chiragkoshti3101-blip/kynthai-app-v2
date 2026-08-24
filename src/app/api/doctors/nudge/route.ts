import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { sanitizeText, rateLimit } from '@/lib/security'
import { requireAuth, requireAuthWithCsrf, jsonError, jsonOk, readJson, audit } from '@/lib/api-helpers'
import { sendNudge } from '@/lib/notifications'
export const dynamic = 'force-dynamic'

// POST /api/doctors/nudge
export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!
  if (u.role !== 'doctor') return jsonError('Only doctors may nudge patients', 403)

  const body = await readJson<{ patientId?: string; message?: string; channel?: string }>(req)
  if (!body) return jsonError('Invalid JSON', 400)
  if (!body.patientId) return jsonError('patientId is required', 400)

  const message = sanitizeText(body.message, 500) || 'Time to take your medication'
  const channel = sanitizeText(body.channel, 20) || 'in-app'

  const profile = await db.doctorProfile.findUnique({ where: { userId: u.id } })
  if (!profile) return jsonError('Doctor profile not found. Submit verification first.', 404)
  if (!profile.verified) return jsonError('Only verified doctors may nudge patients', 403)

  // IDOR: ensure patient is linked to this doctor.
  const linked = await db.appointment.findFirst({
    where: { doctorId: profile.id, patientId: body.patientId },
  })
  if (!linked) return jsonError('Patient is not in your panel', 403)

  const notif = await db.notificationLog.create({
    data: {
      userId: body.patientId,
      channel,
      type: 'nudge',
      title: `Nudge from Dr. ${u.name}`,
      body: message,
      recipient: body.patientId,
      status: 'sent',
      cost: 0,
    },
  })

  // Best-effort: deliver the nudge by in-app/email only.
  try {
    await sendNudge(body.patientId, u.name ?? 'Doctor', message)
  } catch { /* best-effort — sendNotification logs internally */ }

  await logAudit(u.id, 'doctor.nudge', `patient=${body.patientId} notif=${notif.id}`)
  return jsonOk({ sent: true, notificationId: notif.id })
}
