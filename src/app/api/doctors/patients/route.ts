import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { sanitizeText, rateLimit } from '@/lib/security'
import { requireAuth, requireAuthWithCsrf, jsonError, jsonOk, readJson, audit } from '@/lib/api-helpers'
import {
  DEFAULT_APPOINTMENT_MINUTES,
  MAX_APPOINTMENT_MINUTES,
  clinicTimeZone,
  findNextBookableSlot,
  isSlotConflictError,
} from '@/lib/doctor-availability'
export const dynamic = 'force-dynamic'

// POST /api/doctors/patients
// Adds a patient to the doctor's panel. Free tier caps at 5 patients; returns 402 if exceeded.
export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!
  if (u.role !== 'doctor') return jsonError('Only doctors may add patients', 403)

  const profile = await db.doctorProfile.findUnique({
    where: { userId: u.id },
    include: { user: { select: { timezone: true } } },
  })
  if (!profile) return jsonError('Doctor profile not found. Submit verification first.', 404)
  if (!profile.verified) return jsonError('Only verified doctors may add patients', 403)

  await logAudit(user.id, 'doctor.patients.list')

  const body = await readJson<{
    patientEmail?: string
    patientPhone?: string
    patientId?: string
    name?: string
    age?: number
    reason?: string
  }>(req)
  if (!body) return jsonError('Invalid JSON', 400)

  // Find or create patient — try id, then email, then phone
  let patient = body.patientId ? await db.user.findUnique({ where: { id: body.patientId } }) : null
  if (!patient && body.patientEmail) {
    patient = await db.user.findUnique({ where: { email: sanitizeText(body.patientEmail, 254).toLowerCase() } })
  }
  if (!patient && body.patientPhone) {
    const phone = sanitizeText(body.patientPhone, 20)
    if (/^\+[1-9]\d{7,14}$/.test(phone)) {
      patient = await db.user.findFirst({ where: { phone } })
    }
  }
  if (!patient) {
    // Create a placeholder patient account (no password — must accept invite).
    const email = sanitizeText(body.patientEmail, 254).toLowerCase()
    const phone = body.patientPhone ? sanitizeText(body.patientPhone, 20) : ''
    if (!email && !phone) return jsonError('patientEmail, patientPhone, or patientId is required', 400)
    patient = await db.user.create({
      data: {
        email: email || `placeholder-${Date.now()}@kynthai.app`,
        phone: phone && /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null,
        name: sanitizeText(body.name, 120) || 'Patient',
        role: 'patient',
        password: null,
      },
    })
  }

  // Count existing patients (distinct patientIds in this doctor's appointments).
  const existingPatients = await db.appointment.groupBy({
    by: ['patientId'],
    where: { doctorId: profile.id },
  })
  const alreadyLinked = existingPatients.some((p: any) => p.patientId === patient!.id)

  if (!alreadyLinked) {
    const { canAddPatient } = await import('@/lib/doctor-subscription')
    const capCheck = canAddPatient(existingPatients.length, profile.subscriptionTier, profile.patientSlotCap)
    if (!capCheck.allowed) {
      return jsonError(
        `Free-tier patient cap (${capCheck.cap}) reached. Upgrade to Pro to add more patients.`,
        402,
      )
    }

    // The panel is driven by appointments, so an initial one has to exist — but
    // at a real bookable instant, under the same clinic-zone hours and overlap
    // rules as POST /api/appointments. Parking it at now+24h could land outside
    // the doctor's hours or on top of a booked consultation and hold that slot.
    const from = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const [windows, live] = await Promise.all([
      db.doctorAvailabilitySlot.findMany({
        where: { doctorId: profile.id, active: true },
        select: { day: true, start: true, end: true },
      }),
      db.appointment.findMany({
        where: {
          doctorId: profile.id,
          status: { in: ['pending', 'confirmed', 'rescheduled'] },
          deletedAt: null,
          scheduledAt: {
            gte: new Date(from.getTime() - MAX_APPOINTMENT_MINUTES * 60_000),
            lt: new Date(from.getTime() + 15 * 24 * 60 * 60 * 1000),
          },
        },
        select: { scheduledAt: true, durationMinutes: true },
      }),
    ])
    const scheduledAt = findNextBookableSlot({
      windows,
      clinicTimeZone: clinicTimeZone(profile.user?.timezone),
      from,
      appointmentMinutes: DEFAULT_APPOINTMENT_MINUTES,
      booked: live.map((a) => ({ at: a.scheduledAt, durationMinutes: a.durationMinutes })),
    })
    if (!scheduledAt) {
      return jsonError(
        'No open slot in your availability over the next 14 days. Set your clinic hours and try again.',
        409,
        'NO_AVAILABILITY',
      )
    }

    try {
      await db.appointment.create({
        data: {
          doctorId: profile.id,
          patientId: patient.id,
          scheduledAt,
          durationMinutes: DEFAULT_APPOINTMENT_MINUTES,
          type: 'video',
          status: 'pending',
          price: profile.consultationFee,
          commission: 0,
          reason: sanitizeText(body.reason, 500) || 'Initial consultation',
        },
      })
    } catch (error) {
      if (isSlotConflictError(error)) {
        return jsonError('That slot was just taken. Try adding the patient again.', 409, 'SLOT_UNAVAILABLE')
      }
      throw error
    }
  }

  await logAudit(u.id, 'doctor.patient.add', `patient=${patient.id}`)
  return jsonOk({
    patient: { id: patient.id, name: patient.name, email: patient.email },
    added: !alreadyLinked,
  })
}
