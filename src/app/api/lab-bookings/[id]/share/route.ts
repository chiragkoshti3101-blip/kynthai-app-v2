import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { sanitizeText, rateLimit } from '@/lib/security'
import { requireAuthWithCsrf, jsonError, jsonOk, readJson } from '@/lib/api-helpers'
import { sendNotification } from '@/lib/notifications'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * POST /api/lab-bookings/[id]/share — patient shares lab results with a linked doctor
 *
 * Creates a time-limited share token, notifies the selected doctor(s),
 * and returns the share link.
 */

function generateShareToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

const SHARE_TTL_HOURS = 48

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, 10, 60000)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!

  const { id } = await params

  // Verify booking belongs to this patient and has results
  const booking = await db.labBooking.findUnique({
    where: { id },
    include: {
      lab: true,
      patient: { select: { id: true, name: true, email: true } },
    },
  })
  if (!booking) return jsonError('Booking not found', 404)
  if (booking.patientId !== u.id) return jsonError('Forbidden — not your booking', 403)
  if (!booking.resultsFile) return jsonError('No results to share', 400)

  const body = await readJson<{ doctorIds?: string[]; message?: string }>(req)
  const doctorIds = body?.doctorIds ?? []
  const customMessage = sanitizeText(body?.message ?? '', 500)

  // Get patient's linked doctors (from appointments with completed status)
  const appointments = await db.appointment.findMany({
    where: {
      patientId: u.id,
      status: { in: ['completed', 'confirmed'] },
    },
    include: {
      doctor: { include: { user: true } },
    },
    distinct: ['doctorId'],
  })
  const linkedDoctorIds = [...new Set(appointments.map(a => a.doctorId))]

  if (linkedDoctorIds.length === 0) {
    return jsonError('No linked doctors found. Book an appointment first.', 400)
  }

  // Validate requested doctorIds are in the linked set
  const validDoctorIds = doctorIds.length > 0
    ? doctorIds.filter(id => linkedDoctorIds.includes(id))
    : linkedDoctorIds // default: share with all linked doctors

  if (validDoctorIds.length === 0) {
    return jsonError('No valid linked doctors selected', 400)
  }

  // Generate share token
  const shareToken = generateShareToken()
  const shareExpiresAt = new Date(Date.now() + SHARE_TTL_HOURS * 60 * 60 * 1000)

  // Update booking with share token
  await db.labBooking.update({
    where: { id },
    data: { shareToken, shareExpiresAt },
  })

  // Get doctor details for notifications
  const doctors = await db.doctorProfile.findMany({
    where: { id: { in: validDoctorIds } },
    include: { user: true },
  })

  // Send notification to each doctor
  for (const doc of doctors) {
    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://kynthai.app'}/lab/share/${shareToken}`
    try {
      await sendNotification(
        { userId: doc.userId, email: doc.user?.email, phone: null },
        {
          title: 'Lab results shared with you',
          body: `${booking.patient.name || 'A patient'} shared lab results from ${booking.lab.labName || 'the lab'}. ${customMessage || 'View the results below.'} Link expires in ${SHARE_TTL_HOURS} hours.`,
          type: 'lab_share',
          data: { bookingId: id, shareToken, patientName: booking.patient.name || 'Patient', labName: booking.lab.labName || 'Lab', url: '/doctor' },
          dedupeKey: `lab-booking:${id}:shared:${doc.userId}`,
        },
      )
    } catch { /* best-effort */ }
  }

  await logAudit(u.id, 'lab_bookings.share', `booking=${id} doctors=${validDoctorIds.length}`)

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://kynthai.app'}/lab/share/${shareToken}`
  return jsonOk({
    shareToken,
    shareUrl,
    shareExpiresAt: shareExpiresAt.toISOString(),
    doctorsNotified: doctors.length,
  })
}