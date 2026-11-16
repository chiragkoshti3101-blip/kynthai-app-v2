import { NextRequest } from 'next/server'
// import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { sanitizeText, rateLimit } from '@/lib/security'

// Prescription image data is encrypted by the Prisma field-encryption extension.

import {
  requireAuth,
  requireAuthWithCsrf,
  jsonError,
  jsonOk,
  readJson,
  audit,
  parseJsonCol,
  checkConsent,
} from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

// GET /api/prescriptions?patientId=...&doctorId=...
// Patient sees their own; doctor sees prescriptions they issued.
export async function GET(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!
  const u = user!

  const consentErr = checkConsent(u)
  if (consentErr) return consentErr

  const sp = req.nextUrl.searchParams
  const patientId = sp.get('patientId')?.trim()
  let doctorId = sp.get('doctorId')?.trim()

  const and: any[] = []
  if (patientId) {
    if (patientId !== u.id && u.role === 'doctor') {
      const profile = await db.doctorProfile.findUnique({
        where: { userId: u.id },
        select: { id: true, verified: true },
      })
      if (!profile?.verified) {
        return jsonError('Only verified doctors may view a patient prescription history', 403)
      }

      const [patient, appointmentLink, prescriptionLink] = await Promise.all([
        db.user.findUnique({
          where: { id: patientId },
          select: { consentAccepted: true, dataProcessingConsent: true },
        }),
        db.appointment.findFirst({
          where: {
            patientId,
            doctorId: profile.id,
            status: { in: ['confirmed', 'completed', 'pending', 'rescheduled'] as any },
            deletedAt: null,
          },
          select: { id: true },
        }),
        db.prescription.findFirst({
          where: { patientId, doctorId: profile.id },
          select: { id: true },
        }),
      ])
      if (!patient?.consentAccepted || !patient.dataProcessingConsent) {
        return jsonError('Patient clinical-data consent is not active', 403)
      }
      if (!appointmentLink && !prescriptionLink) {
        return jsonError('Forbidden — you do not treat this patient', 403)
      }

      // A doctor querying a patient may only see prescriptions from their own
      // practice through this endpoint. The full permitted longitudinal view
      // remains available from the dedicated chart route.
      if (doctorId && doctorId !== profile.id) return jsonError('Forbidden', 403)
      doctorId = profile.id
    } else if (patientId !== u.id && u.role !== 'admin') {
      return jsonError('Forbidden', 403)
    }
    and.push({ patientId })
  }
  if (doctorId) {
    // A doctor filter is not permission to read that doctor's other patients.
    if (u.role !== 'doctor' && u.role !== 'admin' && !patientId) and.push({ patientId: u.id })
    if (u.role === 'doctor') {
      const profile = await db.doctorProfile.findUnique({ where: { userId: u.id } })
      if (!profile || profile.id !== doctorId) {
        return jsonError('Forbidden', 403)
      }
    }
    and.push({ doctorId })
  }
  if (!patientId && !doctorId) {
    if (u.role === 'patient') and.push({ patientId: u.id })
    else if (u.role === 'doctor') {
      const profile = await db.doctorProfile.findUnique({ where: { userId: u.id } })
      if (!profile) return jsonOk([])
      and.push({ doctorId: profile.id })
    } else {
      return jsonError('patientId or doctorId query param required', 400)
    }
  }

  const where: any = { AND: and }
  const prescriptions = await db.prescription.findMany({
    where,
    include: { patient: true, doctor: { include: { user: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return jsonOk(
    prescriptions.map((p: any) => ({
      id: p.id,
      doctorId: p.doctorId,
      doctorName: p.doctor.user.name,
      patientId: p.patientId,
      patientName: p.patient.name,
      medications: parseJsonCol(p.medications, []),
      notes: p.notes,
      // The API exposes presence only; the Prisma extension decrypts the field
      // for the server and transitional legacy rows remain readable.
      imageBase64: p.imageBase64 ? '[present]' : null,
      followUpDate: p.followUpDate?.toISOString() ?? null,
      followUpNotes: p.followUpNotes,
      inviteStatus: (p as any).inviteStatus,
      inviteToken: (p as any).inviteToken ?? null,
      specialization: (p as any).doctor?.specialization ?? null,
      createdAt: p.createdAt.toISOString(),
    })),
  )
}

// POST /api/prescriptions — patient or doctor uploads/records a prescription.
export async function POST(req: NextRequest) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!

  const body = await readJson<{
    patientId?: string
    doctorId?: string
    medications?: Array<{ name: string; dosage: string; times?: string[] }>
    notes?: string
    imageBase64?: string
    followUpDate?: string
  }>(req)
  if (!body) return jsonError('Invalid JSON', 400)

  // Issuing a clinical prescription must use the verified doctor workflow,
  // which checks the treating relationship, consent, allergies and licensure.
  // This upload endpoint cannot safely impersonate that issuing workflow.
  return jsonError('Use the verified doctor prescribing workflow', 403)
}
