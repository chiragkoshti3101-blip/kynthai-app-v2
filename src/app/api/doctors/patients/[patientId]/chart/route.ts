import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { jsonError, jsonOk, parseJsonCol, requireAuth } from '@/lib/api-helpers'
import { rateLimit } from '@/lib/security'
import { logAudit } from '@/lib/auth'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/doctors/patients/:patientId/chart
 *
 * Returns the complete permitted longitudinal chart for a doctor who actually
 * treats the patient. This is intentionally not a generic patient export:
 * private journals and private documents stay private, while clinical
 * documents are returned as metadata and remain protected by their download
 * endpoint. The doctor UI requests history=full so older records are not
 * silently hidden behind a recent-record cap.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ patientId: string }> },
) {
  const limited = rateLimit(req, 30, 60_000)
  if (limited) return limited

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!
  if (user.role !== 'doctor') return jsonError('Only doctors may access patient charts', 403)

  const { patientId } = await params
  if (!patientId || patientId.length > 120) return jsonError('Invalid patient id', 400)
  const fullHistoryRequested = req.nextUrl.searchParams.get('history') === 'full'

  try {
    const doctor = await db.doctorProfile.findUnique({
      where: { userId: user.id },
      select: { id: true, verified: true },
    })
    if (!doctor) return jsonError('Doctor profile not found', 404)
    if (!doctor.verified) return jsonError('Doctor verification is required to access charts', 403)

    // A prescription or appointment is the treatment relationship. Do not
    // allow a doctor to enumerate arbitrary patients by changing the URL.
    const [appointmentLink, prescriptionLink] = await Promise.all([
      db.appointment.findFirst({
        where: { doctorId: doctor.id, patientId, deletedAt: null },
        select: { id: true },
      }),
      db.prescription.findFirst({
        where: { doctorId: doctor.id, patientId },
        select: { id: true },
      }),
    ])
    if (!appointmentLink && !prescriptionLink) {
      await logAudit({
        userId: user.id,
        action: 'doctor.patient.chart.read',
        category: 'access',
        resourceType: 'User',
        resourceId: patientId,
        httpMethod: 'GET',
        httpPath: req.nextUrl.pathname,
        statusCode: 403,
        outcome: 'forbidden',
        details: 'Chart access denied: no treatment relationship',
      })
      return jsonError('You do not treat this patient', 403)
    }

    const patient = await db.user.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        dateOfBirth: true,
        consentAccepted: true,
        dataProcessingConsent: true,
        allergies: true,
        chronicConditions: {
          orderBy: { createdAt: 'desc' },
        },
        medications: {
          where: { deletedAt: null },
          orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
          include: {
            reminders: {
              where: { deletedAt: null },
              orderBy: { date: 'desc' },
              take: 90,
            },
          },
        },
        prescriptionsReceived: {
          orderBy: { createdAt: 'desc' },
          ...(fullHistoryRequested ? {} : { take: 100 }),
          include: {
            doctor: {
              select: {
                specialization: true,
                user: { select: { name: true } },
              },
            },
          },
        },
        appointments: {
          where: { deletedAt: null },
          orderBy: { scheduledAt: 'desc' },
          ...(fullHistoryRequested ? {} : { take: 100 }),
          include: {
            doctor: {
              select: {
                specialization: true,
                user: { select: { name: true } },
              },
            },
          },
        },
        labBookings: {
          where: { status: { not: 'cancelled' } },
          orderBy: { scheduledAt: 'desc' },
          ...(fullHistoryRequested ? {} : { take: 100 }),
          select: {
            id: true,
            tests: true,
            scheduledAt: true,
            status: true,
            notes: true,
            resultsFile: true,
            resultsNote: true,
            resultUploadedAt: true,
            shareToken: true,
            shareExpiresAt: true,
            resultsSharedWith: true,
            lab: { select: { labName: true } },
          },
        },
        documents: {
          where: {
            visibility: { in: ['DOCTOR', 'EMERGENCY'] },
            category: { in: ['CLINICAL', 'ADMINISTRATIVE'] },
          },
          orderBy: { uploadedAt: 'desc' },
          ...(fullHistoryRequested ? {} : { take: 100 }),
        },
      },
    })
    if (!patient) return jsonError('Patient not found', 404)

    // Sharing clinical data without the patient's health-data consent would
    // be a privacy bug. The platform already requires this consent for real
    // health endpoints; keep the patient-side check explicit at this boundary.
    if (!patient.consentAccepted || !patient.dataProcessingConsent) {
      await logAudit({
        userId: user.id,
        action: 'doctor.patient.chart.read',
        category: 'access',
        resourceType: 'User',
        resourceId: patientId,
        httpMethod: 'GET',
        httpPath: req.nextUrl.pathname,
        statusCode: 403,
        outcome: 'forbidden',
        details: 'Chart access denied: patient consent is not active',
      })
      return jsonError('Patient clinical-data consent is not active', 403)
    }

    // Consultation notes are scoped to the requesting doctor. Other
    // providers' private notes are not silently disclosed across practices.
    const consultationNotes = await db.consultationNote.findMany({
      where: { doctorId: doctor.id, patientId },
      orderBy: { createdAt: 'desc' },
      ...(fullHistoryRequested ? {} : { take: 100 }),
    })

    const allergies = parseStringList(patient.allergies)
    const age = patient.dateOfBirth ? calculateAge(patient.dateOfBirth) : null
    const now = new Date()

    await logAudit({
      userId: user.id,
      action: 'doctor.patient.chart.read',
      category: 'access',
      resourceType: 'User',
      resourceId: patientId,
      httpMethod: 'GET',
      httpPath: req.nextUrl.pathname,
      statusCode: 200,
      outcome: 'success',
      details: 'Authorized longitudinal clinical chart viewed',
    })

    return jsonOk({
      patient: {
        id: patient.id,
        name: patient.name || 'Patient',
        email: patient.email,
        phone: patient.phone,
        age,
        allergies,
        consent: {
          termsAccepted: patient.consentAccepted,
          clinicalDataSharing: patient.dataProcessingConsent,
        },
      },
      summary: {
        activeMedicationCount: patient.medications.filter((m) => m.active).length,
        totalMedicationCount: patient.medications.length,
        chronicConditionCount: patient.chronicConditions.length,
        prescriptionCount: patient.prescriptionsReceived.length,
        encounterCount: patient.appointments.length,
        sharedDocumentCount: patient.documents.length,
      },
      chronicConditions: patient.chronicConditions.map((condition) => ({
        id: condition.id,
        name: condition.name || 'Unnamed condition',
        diagnosedDate: condition.diagnosedDate,
        severity: condition.severity,
        medications: parseStringList(condition.medications),
        notes: condition.notes,
        active: condition.active,
        createdAt: condition.createdAt.toISOString(),
      })),
      medications: patient.medications.map((medication) => {
        const reminders = medication.reminders
        const taken = reminders.filter((reminder) => reminder.status === 'taken').length
        return {
          id: medication.id,
          name: medication.name || 'Unnamed medication',
          dosage: medication.dosage,
          frequency: medication.frequency,
          times: parseStringList(medication.times),
          instructions: medication.instructions,
          notes: medication.notes,
          active: medication.active,
          createdAt: medication.createdAt.toISOString(),
          updatedAt: medication.updatedAt.toISOString(),
          adherence: {
            sampleSize: reminders.length,
            taken,
            percentage: reminders.length ? Math.round((taken / reminders.length) * 100) : null,
          },
        }
      }),
      prescriptions: patient.prescriptionsReceived.map((prescription) => ({
        id: prescription.id,
        medications: parseJsonCol(prescription.medications, []),
        notes: prescription.notes,
        followUpDate: prescription.followUpDate?.toISOString() ?? null,
        followUpNotes: prescription.followUpNotes,
        createdAt: prescription.createdAt.toISOString(),
        prescriber: {
          name: prescription.doctor.user.name || 'Doctor',
          specialization: prescription.doctor.specialization,
        },
      })),
      appointments: patient.appointments.map((appointment) => ({
        id: appointment.id,
        scheduledAt: appointment.scheduledAt.toISOString(),
        type: appointment.type,
        status: appointment.status,
        reason: appointment.reason,
        // Keep other clinicians' private appointment notes out of a shared
        // chart; the requesting doctor can see their own notes below.
        notes: appointment.doctorId === doctor.id ? appointment.notes : null,
        doctor: {
          name: appointment.doctor.user.name || 'Doctor',
          specialization: appointment.doctor.specialization,
        },
      })),
      labHistory: patient.labBookings.map((booking) => ({
        id: booking.id,
        labName: booking.lab.labName || 'Laboratory',
        tests: parseJsonCol(booking.tests, []),
        scheduledAt: booking.scheduledAt.toISOString(),
        status: booking.status,
        resultsAvailable: Boolean(booking.resultsFile),
        // A lab result note is part of the report; disclose it only when the
        // patient shared this booking with the requesting doctor's profile.
        notes: booking.notes,
        resultsNote: booking.shareToken && booking.shareExpiresAt && booking.shareExpiresAt > now &&
          (booking.resultsSharedWith.length === 0 || booking.resultsSharedWith.includes(doctor.id))
          ? booking.resultsNote
          : null,
        resultUploadedAt: booking.resultUploadedAt?.toISOString() ?? null,
        resultsShared: Boolean(
          booking.shareToken &&
          booking.shareExpiresAt &&
          booking.shareExpiresAt > now &&
          (booking.resultsSharedWith.length === 0 || booking.resultsSharedWith.includes(doctor.id))
        ),
        resultDownloadPath: booking.resultsFile && booking.shareToken && booking.shareExpiresAt &&
          booking.shareExpiresAt > now &&
          (booking.resultsSharedWith.length === 0 || booking.resultsSharedWith.includes(doctor.id))
          ? `/api/lab-bookings/${booking.id}/results/file?share=${encodeURIComponent(booking.shareToken)}`
          : null,
      })),
      consultationNotes: consultationNotes.map((note) => ({
        id: note.id,
        content: note.content,
        type: note.type,
        createdAt: note.createdAt.toISOString(),
      })),
      documents: patient.documents.map((document) => ({
        id: document.id,
        type: document.type,
        category: document.category,
        title: document.title,
        description: document.description,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
        visibility: document.visibility,
        uploadedAt: document.uploadedAt.toISOString(),
        downloadPath: `/api/documents/${document.id}/download`,
      })),
      access: {
        relationship: appointmentLink ? 'appointment' : 'prescription',
        privateJournalsExcluded: true,
        privateDocumentsExcluded: true,
      },
    })
  } catch (error) {
    logger.phiSafeError(error, 'doctors.patient.chart.GET')
    return jsonError('Failed to load patient chart', 500)
  }
}

function parseStringList(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean)
  } catch {
    // Legacy rows sometimes store comma-separated values.
  }
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function calculateAge(dateOfBirth: Date): number | null {
  const now = new Date()
  let age = now.getFullYear() - dateOfBirth.getFullYear()
  const monthDelta = now.getMonth() - dateOfBirth.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dateOfBirth.getDate())) age -= 1
  return age >= 0 && age < 130 ? age : null
}
