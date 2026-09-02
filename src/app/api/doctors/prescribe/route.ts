import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { sanitizeText, rateLimit } from '@/lib/security'
import { requireAuth, requireAuthWithCsrf, jsonError, jsonOk, readJson, audit } from '@/lib/api-helpers'
import { AppointmentStatus } from '@prisma/client'
import { sendInvite, sendFollowUp } from '@/lib/notifications'
import { logger } from '@/lib/logger'
export const dynamic = 'force-dynamic'

// GET /api/doctors/prescribe — list prescription history for this doctor.
export async function GET(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!
  if (user.role !== 'doctor') return jsonError('Only doctors may view prescriptions', 403)

  const profile = await db.doctorProfile.findUnique({ where: { userId: user.id } })
  if (!profile) return jsonError('Doctor profile not found', 404)

  try {
    const prescriptions = await db.prescription.findMany({
      where: { doctorId: profile.id },
      include: { patient: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return jsonOk({
      prescriptions: prescriptions.map((p: any) => ({
        id: p.id,
        patient: p.patient,
        // Health Data Protection: medications notes are decrypted via Prisma middleware
        medications: JSON.parse(p.medications),
        notes: p.notes,
        followUpDate: p.followUpDate?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    // Security: never log raw DB errors — they may contain sensitive health data
    logger.phiSafeError(error, 'doctors.prescribe.GET')
    return jsonError('Failed to load prescriptions', 500)
  }
}

function parseAllergyList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  if (typeof value !== 'string' || !value.trim()) return []

  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parseAllergyList(parsed)
  } catch {
    // Legacy rows may contain a comma-separated list instead of JSON.
  }

  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

interface MedInput {
  name?: string
  dosage?: string
  times?: string[]
  frequency?: string
  instructions?: string
}

// POST /api/doctors/prescribe
// Prescribes medications to a patient: auto-creates Medication rows + invite token + follow-up appointment.
export async function POST(req: NextRequest) {
  try {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!
  if (u.role !== 'doctor') return jsonError('Only doctors may prescribe', 403)

  const body = await readJson<{
    patientId?: string
    patientEmail?: string
    medications?: MedInput[]
    notes?: string
    followUpDate?: string
  }>(req)
  if (!body) return jsonError('Invalid JSON', 400)

  if (!Array.isArray(body.medications) || body.medications.length === 0) {
    return jsonError('At least one medication is required', 400)
  }

  const profile = await db.doctorProfile.findUnique({ where: { userId: u.id } })
  if (!profile) return jsonError('Doctor profile not found', 404)
  if (!profile.verified) return jsonError('Only verified doctors may prescribe', 403)

  let patient = body.patientId ? await db.user.findUnique({ where: { id: body.patientId } }) : null
  if (!patient && body.patientEmail) {
    patient = await db.user.findUnique({
      where: { email: sanitizeText(body.patientEmail, 254).toLowerCase() },
    })
  }
  if (!patient) return jsonError('Patient not found. Add the patient first by email.', 404)

  // Check patient allergies before prescribing. Handle both current JSON rows
  // and legacy comma-separated rows so a format mismatch cannot skip the alert.
  const patientAllergies = parseAllergyList((patient as any).allergies)
  const medNames = body.medications?.map((m) => sanitizeText(m.name, 120).toLowerCase()) ?? []
  const allergyWarnings = patientAllergies.filter((a) =>
    medNames.some((m) => m.includes(a.toLowerCase()) || a.toLowerCase().includes(m))
  )
  if (allergyWarnings.length > 0) {
    return jsonError(
      `Allergy alert: Patient is allergic to ${allergyWarnings.join(', ')}. Prescribe with caution.`,
      400,
    )
  }

  // IDOR: verify this doctor actually treats this patient
  const treatmentLink = await db.appointment.findFirst({
    where: {
      doctorId: profile.id,
      patientId: patient.id,
      status: { in: ['confirmed', 'completed', 'pending', 'rescheduled'] as AppointmentStatus[] },
      deletedAt: null,
    },
  })
  if (!treatmentLink) return jsonError('Forbidden — you do not treat this patient', 403)

  const cleanedMeds = body.medications
    .map((m) => ({
      name: sanitizeText(m.name, 120),
      dosage: sanitizeText(m.dosage, 60),
      times: Array.isArray(m.times) ? m.times.filter(Boolean) : [],
      frequency: sanitizeText(m.frequency, 60) || 'Daily',
      instructions: sanitizeText(m.instructions, 500),
    }))
    .filter((m) => m.name && m.dosage)

  if (cleanedMeds.length === 0) return jsonError('Medications must include name + dosage', 400)

  const inviteToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const inviteLink = `/invite?token=${inviteToken}`

  const followUpAt = body.followUpDate ? new Date(body.followUpDate) : null
  if (followUpAt && Number.isNaN(followUpAt.getTime())) {
    return jsonError('Follow-up date is invalid', 422, 'VALIDATION_ERROR')
  }

  // Medication rows, the prescription invite, and an optional follow-up are a
  // single clinical write. If any part fails, roll back the entire operation
  // rather than leaving orphan medications or a prescription without its
  // scheduled follow-up.
  const inviteExpiresAt = new Date()
  inviteExpiresAt.setDate(inviteExpiresAt.getDate() + 30) // 30-day expiry

  const { createdMeds, prescription, followUp } = await db.$transaction(async (tx) => {
    const createdMeds: any[] = []
    for (const medication of cleanedMeds) {
      createdMeds.push(await tx.medication.create({
        data: {
          userId: patient!.id,
          name: medication.name,
          dosage: medication.dosage,
          times: JSON.stringify(medication.times.length ? medication.times : ['09:00']),
          frequency: medication.frequency,
          instructions: medication.instructions || null,
          active: true,
        },
      }))
    }

    const prescription = await tx.prescription.create({
      data: {
        doctorId: profile.id,
        patientId: patient.id,
        notes: sanitizeText(body.notes, 2000),
        medications: JSON.stringify(
          cleanedMeds.map((medication, index) => ({ id: createdMeds[index]!.id, ...medication })),
        ),
        inviteToken,
        inviteStatus: 'sent',
        inviteExpiresAt,
        followUpDate: followUpAt,
      },
    })

    let followUp: { id: string; scheduledAt: string } | null = null
    if (followUpAt) {
      const created = await tx.appointment.create({
        data: {
          doctorId: profile.id,
          patientId: patient.id,
          scheduledAt: followUpAt,
          type: 'video',
          status: 'pending',
          price: profile.consultationFee,
          commission: 0,
          reason: 'Follow-up consultation',
        },
      })
      followUp = { id: created.id, scheduledAt: created.scheduledAt.toISOString() }
    }

    return { createdMeds, prescription, followUp }
  })

  // Send follow-up reminder only after the clinical records have committed.
  if (followUp) {
    try {
      await sendFollowUp(
        patient.id,
        u.name ?? 'Doctor',
        followUp.scheduledAt,
        followUp.id,
        {
          email: patient.email,
          phone: null,
        },
      )
    } catch { /* best-effort */ }
  }

  // Deliver prescription invite by email only.
  // ponytail: inviteLink stays relative for the doctor's copy-link UI (it
  // prefixes window.location.origin), but the email must get an absolute URL
  // or the link is not clickable from mail clients.
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://kynthai.app'}${inviteLink}`
  try {
    await sendInvite(patient.id, u.name ?? 'Doctor', inviteUrl, cleanedMeds.length, {
      email: patient.email,
      phone: null,
    }, `prescription:${prescription.id}`)
  } catch { /* best-effort — sendNotification logs internally */ }

  await logAudit(u.id, 'doctor.prescribe', `patient=${patient.id} prescription=${prescription.id} meds=${cleanedMeds.length}`)

  return jsonOk({
    prescription: {
      id: prescription.id,
      patientId: patient.id,
      medications: JSON.parse(prescription.medications),
      notes: prescription.notes,
      inviteToken,
      inviteLink,
      followUpDate: prescription.followUpDate?.toISOString() ?? null,
    },
    medications: createdMeds.map((m) => ({ ...m, times: JSON.parse(m.times) })),
    followUp,
  })
  } catch (error: any) {
    logger.phiSafeError(error, 'doctors.prescribe');
    return jsonError(error?.message?.slice(0, 300) || 'Failed to create prescription', 500);
  }
}
