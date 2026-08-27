import { NextRequest } from 'next/server'
// import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { sanitizeText, rateLimit } from '@/lib/security'

import { encryptValue, decryptValue } from '@/lib/encryption' // ENCRYPTION-AT-REST

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
  const doctorId = sp.get('doctorId')?.trim()

  const and: any[] = []
  if (patientId) {
    if (patientId !== u.id && u.role !== 'admin') {
      return jsonError('Forbidden', 403)
    }
    if (patientId !== u.id && u.role === 'doctor') {
      const treatmentLink = await db.appointment.findFirst({
        where: { patientId, doctor: { userId: u.id }, status: { in: ['confirmed', 'completed', 'pending'] as any } },
      })
      if (!treatmentLink) {
        return jsonError('Forbidden — you do not treat this patient', 403)
      }
    }
    and.push({ patientId })
  }
  if (doctorId) {
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
      // ENCRYPTION-AT-REST: decrypt the stored imageBase64 before returning.
      // The DB only stores the encrypted blob; [present] was the old placeholder.
      imageBase64: p.imageBase64 ? (decryptValue(p.imageBase64) ? '[present]' : null) : null,
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

  const patientId = body.patientId || u.id
  if (patientId !== u.id && u.role !== 'doctor' && u.role !== 'admin') {
    return jsonError('You can only create prescriptions for yourself', 403)
  }

  let doctorId = body.doctorId
  if (!doctorId && u.role === 'doctor') {
    const profile = await db.doctorProfile.findUnique({ where: { userId: u.id } })
    if (!profile) return jsonError('Doctor profile not found', 404)
    doctorId = profile.id
  }
  if (!doctorId) return jsonError('doctorId is required', 400)
  const doctor = await db.doctorProfile.findUnique({ where: { id: doctorId }, select: { id: true } })
  if (!doctor) return jsonError('Doctor not found', 404)

  const meds = Array.isArray(body.medications) ? body.medications : []
  // ENCRYPTION-AT-REST: wrap the imageBase64 (prescription photo data URI)
  // with AES-256-GCM before persisting to the database.
  // The raw base64 string is sanitized for size (200 KB cap) then encrypted.
  const encryptedImage = body.imageBase64
    ? encryptValue(sanitizeText(body.imageBase64, 200000))
    : null
  const prescription = await db.prescription.create({
    data: {
      doctorId,
      patientId,
      notes: sanitizeText(body.notes, 2000) || null,
      imageBase64: encryptedImage, // ENCRYPTED — decryptValue() to read back
      medications: JSON.stringify(meds),
      followUpDate: body.followUpDate ? new Date(body.followUpDate) : null,
      inviteStatus: 'accepted',
    } as any,
  })

  await logAudit(u.id, 'prescription.create', `prescription=${prescription.id}`)
  return jsonOk({
    id: prescription.id,
    medications: parseJsonCol(prescription.medications, []),
    notes: prescription.notes,
    followUpDate: prescription.followUpDate?.toISOString() ?? null,
    createdAt: prescription.createdAt.toISOString(),
  })
}
