import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { jsonOk, jsonError, requireAuth } from '@/lib/api-helpers'
import { sanitizeText } from '@/lib/security'
import { checkCsrf } from '@/lib/csrf'
import { logger } from '@/lib/logger'
import { sendNotification } from '@/lib/notifications'
export const dynamic = 'force-dynamic'

// GET /api/care-workflow — Full care timeline for a patient.
// Returns prescriptions + lab bookings in chronological order.
// Roles: patient (own data), doctor (their patients), caretaker (family members), lab (their bookings)
export async function GET(req: NextRequest) {
  const { response, user } = await requireAuth(req)
  if (response || !user) return response!

  // Audit: this sensitive health data access
  await logAudit(user.id, 'care_workflow.read', { resourceType: 'Appointment' });
  try {
    const sp = req.nextUrl.searchParams
    const patientId = sp.get('patientId')?.trim()
    const u = user

    // Resolve target patient
    let targetPatientId: string | undefined
    if (u.role === 'patient') {
      targetPatientId = u.id
    } else if (u.role === 'caretaker') {
      // Get first family member for demo, or use patientId param
      targetPatientId = patientId || u.id
    } else if (u.role === 'doctor') {
      if (!patientId) return jsonError('patientId required for doctors', 400)
      // Verify doctor treats this patient
      const link = await db.appointment.findFirst({
        where: { patientId, doctor: { userId: u.id } },
      })
      if (!link) return jsonError('You do not treat this patient', 403)
      targetPatientId = patientId
    } else if (u.role === 'lab') {
      targetPatientId = patientId || u.id
    } else {
      return jsonError('Forbidden', 403)
    }

    if (!targetPatientId) return jsonError('patientId required', 400)

    // Run all four read queries in parallel — was 4 sequential round-trips
    // (~12s+ under Supabase pooler). N+1-like pattern fixed here.
    const [prescriptions, labBookings, appointments, journals] = await Promise.all([
      db.prescription.findMany({
        where: { patientId: targetPatientId },
        include: {
          doctor: { include: { user: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      db.labBooking.findMany({
        where: { patientId: targetPatientId },
        include: {
          lab: { include: { user: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      db.appointment.findMany({
        where: { patientId: targetPatientId, deletedAt: null },
        include: {
          doctor: { include: { user: { select: { name: true } } } },
        },
        orderBy: { scheduledAt: 'desc' },
        take: 20,
      }),
      db.healthJournal.findMany({
        where: { userId: targetPatientId, deletedAt: null },
        orderBy: { date: 'desc' },
        take: 20,
      }),
    ]);

    // Build unified timeline
    const timeline: Array<{
      id: string
      type: 'prescription' | 'lab_booking' | 'appointment' | 'health_journal'
      date: string
      status: string
      details: Record<string, unknown>
      actor: string
    }> = []

    for (const p of prescriptions) {
      timeline.push({
        id: `rx-${p.id}`,
        type: 'prescription',
        date: p.createdAt.toISOString(),
        status: (p as any).inviteStatus || 'active',
        details: {
          doctorName: p.doctor?.user?.name || 'Unknown',
          medications: JSON.parse(p.medications || '[]'),
          notes: p.notes,
          followUpDate: p.followUpDate?.toISOString() ?? null,
        },
        actor: p.doctor?.user?.name || 'Doctor',
      })
    }

    for (const b of labBookings) {
      timeline.push({
        id: `lab-${b.id}`,
        type: 'lab_booking',
        date: b.createdAt.toISOString(),
        status: b.status,
        details: {
          labName: b.lab?.labName || 'Unknown Lab',
          tests: JSON.parse(b.tests || '[]'),
          scheduledAt: b.scheduledAt.toISOString(),
          price: b.price,
          homeCollection: b.homeCollection,
        },
        actor: b.lab?.labName || 'Lab',
      })
    }

    for (const a of appointments) {
      timeline.push({
        id: `appt-${a.id}`,
        type: 'appointment',
        date: a.scheduledAt.toISOString(),
        status: a.status,
        details: {
          doctorName: a.doctor?.user?.name || 'Doctor',
          type: a.type,
          reason: a.reason,
          scheduledAt: a.scheduledAt.toISOString(),
        },
        actor: a.doctor?.user?.name || 'Doctor',
      })
    }

    for (const j of journals) {
      let symptoms: string[] = []
      let mood: string | null = null
      let vitals: Record<string, unknown> | null = null
      try {
        symptoms = JSON.parse((j as any).symptoms || '[]')
      } catch { /* keep [] */ }
      try {
        mood = (j as any).mood || null
      } catch { /* ignore */ }
      try {
        const v = (j as any).vitals
        vitals = v ? JSON.parse(v) : null
      } catch { /* ignore */ }
      timeline.push({
        id: `journal-${j.id}`,
        type: 'health_journal',
        date: j.date.toISOString(),
        status: 'recorded',
        details: {
          symptoms,
          mood,
          vitals,
          notes: (j as any).notes || null,
        },
        actor: 'Self',
      })
    }

    // Sort by date descending
    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    // Compute stats
    const activePrescriptions = prescriptions.filter((p: any) => (p as any).inviteStatus !== 'completed').length
    const pendingLabTests = labBookings.filter((b: any) => b.status === 'pending' || b.status === 'sample_collected').length
    const completedLabTests = labBookings.filter((b: any) => b.status === 'completed').length

    return jsonOk({
      timeline,
      stats: {
        totalPrescriptions: prescriptions.length,
        activePrescriptions,
        totalLabBookings: labBookings.length,
        pendingLabTests,
        completedLabTests,
      },
    })
  } catch (error) {
    logger.phiSafeError(error)
    return jsonError('Failed to load care workflow', 500)
  }
}

// POST /api/care-workflow/lab/status — Lab updates booking status.
// Statuses: pending → sample_collected → processing → completed → cancelled
export async function POST(req: NextRequest) {
  const csrfErr = await checkCsrf(req)
  if (csrfErr) return csrfErr

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!
  if (user.role !== 'lab') return jsonError('Only labs can update status', 403)

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return jsonError('Invalid JSON', 400)

    const { bookingId, status, notes } = body as {
      bookingId?: string
      status?: string
      notes?: string
    }

    if (!bookingId) return jsonError('bookingId is required', 400)
    if (!status) return jsonError('status is required', 400)

    const validStatuses = ['pending', 'sample_collected', 'processing', 'completed', 'cancelled']
    if (!validStatuses.includes(status)) {
      return jsonError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400)
    }

    // Verify booking belongs to this lab
    const labProfile = await db.labProfile.findUnique({ where: { userId: user.id } })
    if (!labProfile) return jsonError('Lab profile not found', 404)

    const booking = await db.labBooking.findUnique({
      where: { id: bookingId },
      include: { patient: true, lab: true },
    })
    if (!booking) return jsonError('Booking not found', 404)
    if (booking.labId !== labProfile.id) return jsonError('Forbidden — booking not yours', 403)

    // Update status
    const updated = await db.labBooking.update({
      where: { id: bookingId },
      data: {
        status,
        notes: notes ? sanitizeText(notes, 1000) : booking.notes,
      },
      include: {
        patient: true,
        lab: { include: { user: { select: { name: true } } } },
      },
    })

    // Use the shared router so status changes honor preferences, reach every
    // registered device, and are represented once in the notification center.
    try {
      await sendNotification(
        { userId: booking.patientId },
        {
          title: status === 'completed'
            ? 'Lab results ready'
            : `Lab test update: ${status.replace(/_/g, ' ')}`,
          body: status === 'completed'
            ? `Your ${updated.tests} results are ready. Check the Care tab.`
            : `Your lab test status has been updated to "${status.replace(/_/g, ' ')}".`,
          type: status === 'completed' ? 'lab_results' : 'lab_booking_update',
          data: { bookingId: booking.id, status, url: '/patient' },
          dedupeKey: `lab-booking:${booking.id}:status:${status}:patient`,
        },
      )
    } catch { /* notification non-critical */ }

    return jsonOk({
      id: updated.id,
      status: updated.status,
      notes: updated.notes,
      updatedAt: updated.createdAt.toISOString(),
    })
  } catch (error) {
    logger.phiSafeError(error)
    return jsonError('Failed to update status', 500)
  }
}
