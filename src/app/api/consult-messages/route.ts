import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/security'
import { requireAuth, requireAuthWithCsrf, jsonError, jsonOk, readJson } from '@/lib/api-helpers'
import { logAudit } from '@/lib/auth'
import { sanitizeText } from '@/lib/security'
import { consultMessageSchema } from '@/lib/schemas/security'
export const dynamic = 'force-dynamic'

/** Experimental API — backend-only; no production patient UI consumes this route yet. */

export async function GET(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!

  // Audit: consultation message access
  await logAudit(user.id, 'consultation.message.read', { resourceType: 'ConsultationNote' })

  const appointmentId = req.nextUrl.searchParams.get('appointmentId')
  if (!appointmentId) return jsonError('appointmentId is required', 400)

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: { doctor: { include: { user: true } }, patient: true },
  })
  if (!appt) return jsonError('Appointment not found', 404)

  const isDoctor = user.role === 'doctor' && appt.doctor.userId === user.id
  const isPatient = user.role === 'patient' && appt.patientId === user.id
  if (!isDoctor && !isPatient) return jsonError('Forbidden', 403)

  const messages = await db.consultMessage.findMany({ where: { appointmentId }, orderBy: { createdAt: 'asc' } })
  await db.consultMessage.updateMany({ where: { appointmentId, read: false, NOT: { senderId: user.id } }, data: { read: true } })

  return jsonOk({ messages })
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!

  const rawBody = await readJson(req)
  if (!rawBody) return jsonError('Invalid JSON', 400, 'INVALID_JSON')
  const parsed = consultMessageSchema.safeParse(rawBody)
  if (!parsed.success) {
    const fields: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      fields[String(issue.path.join('.') || 'body')] = issue.message
    }
    return jsonError('Validation failed', 422, 'VALIDATION_ERROR', { fields })
  }
  const body = parsed.data

  const appt = await db.appointment.findUnique({
    where: { id: body.appointmentId },
    include: { doctor: { include: { user: true } }, patient: true },
  })
  if (!appt) return jsonError('Appointment not found', 404)

  const isDoctor = user.role === 'doctor' && appt.doctor.userId === user.id
  const isPatient = user.role === 'patient' && appt.patientId === user.id
  if (!isDoctor && !isPatient) return jsonError('Forbidden', 403)

  const senderRole = user.role === 'doctor' ? 'doctor' : 'patient'
  const message = await db.consultMessage.create({
    data: {
      appointmentId: appt.id,
      senderId: user.id,
      senderRole,
      content: sanitizeText(body.content, 2000),
      doctorId: appt.doctorId,
    },
  })

  await db.appointment.update({ where: { id: appt.id }, data: { status: 'confirmed' } })

  return jsonOk({ message })
}
