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

  const body = await readJson<{ patientId?: string; message?: string; channel?: string; eventId?: string }>(req)
  if (!body) return jsonError('Invalid JSON', 400)
  if (!body.patientId) return jsonError('patientId is required', 400)

  const message = sanitizeText(body.message, 500) || 'Time to take your medication'

  const profile = await db.doctorProfile.findUnique({ where: { userId: u.id } })
  if (!profile) return jsonError('Doctor profile not found. Submit verification first.', 404)
  if (!profile.verified) return jsonError('Only verified doctors may nudge patients', 403)

  // IDOR: ensure patient is linked to this doctor.
  const linked = await db.appointment.findFirst({
    where: { doctorId: profile.id, patientId: body.patientId },
  })
  if (!linked) return jsonError('Patient is not in your panel', 403)

  // The shared router owns the inbox row and all device fan-out. Keeping a
  // single producer prevents duplicate in-app entries and duplicate pushes.
  const requestKey = (req.headers.get('idempotency-key') || body.eventId || '').trim().slice(0, 120)
  const dedupeKey = requestKey ? `nudge:${profile.id}:${body.patientId}:${requestKey}` : undefined
  const result = await sendNudge(body.patientId, u.name ?? 'Doctor', message, {}, dedupeKey)

  await logAudit(u.id, 'doctor.nudge', `patient=${body.patientId} notif=${result.notificationLogId || 'unlogged'}`)
  return jsonOk({ sent: result.delivered || !!result.notificationLogId, notificationId: result.notificationLogId || null })
}
