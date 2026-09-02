import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/auth'
import { sanitizeText, rateLimit } from '@/lib/security'
import { requireAuth, requireAuthWithCsrf, jsonError, jsonOk, readJson, audit, checkConsent } from '@/lib/api-helpers'
import { sendNotification } from '@/lib/notifications'
import { logger } from '@/lib/logger'
export const dynamic = 'force-dynamic'

/**
 * PATCH /api/lab-bookings/[id] — lab/patient updates booking status
 *
 * WORKFLOW:
 *   pending → sample_collected → completed
 *
 * Labs (owner) can advance status. Admins can do anything.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(req, 30, 60000)
  if (limited) return limited

  const { response, user } = await requireAuthWithCsrf(req)
  if (response || !user) return response!
  const u = user!

  const consentErr = checkConsent(u)
  if (consentErr) return consentErr

  const { id } = await params
  const booking = await db.labBooking.findUnique({ where: { id }, include: { lab: true } })
  if (!booking) return jsonError('Booking not found', 404)

  // Only the owning lab, the patient (for cancellation), or admin can update
  const isOwningLab = booking.lab.userId === u.id
  const isPatient = booking.patientId === u.id
  const isAdmin = u.role === 'admin'
  if (!isOwningLab && !isPatient && !isAdmin) {
    return jsonError('Forbidden — only the owning lab, patient, or admin can update bookings', 403)
  }

  const body = await readJson<{ status?: string; notes?: string }>(req)
  if (!body) return jsonError('Invalid JSON', 400)

  // Patients can only cancel
  if (isPatient && body.status && body.status !== 'cancelled') {
    return jsonError('Patients can only cancel bookings', 403)
  }

  const VALID_TRANSITIONS: Record<string, string[]> = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['sample_collected', 'cancelled'],
    sample_collected: ['processing', 'completed'],
    processing: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
  }

  const updates: Record<string, unknown> = {}

  if (body.status) {
    const nextStatus = sanitizeText(body.status, 30)
    const allowed = VALID_TRANSITIONS[booking.status] || []
    if (!allowed.includes(nextStatus)) {
      return jsonError(
        `Cannot transition from ${booking.status} → ${nextStatus}. Allowed: ${allowed.join(', ') || 'none (terminal)'}`,
        400,
        'INVALID_STATUS_TRANSITION',
      )
    }
    updates.status = nextStatus
  }

  if (body.notes !== undefined) {
    updates.notes = sanitizeText(body.notes, 2000) || null
  }

  const updated = await db.labBooking.update({ where: { id }, data: updates })
  await logAudit(u.id, 'lab-bookings.patch', `booking=${id} status=${updated.status}`)

  // ── Refund on cancellation (if payment was captured) ──────────────────
  if (updated.status === 'cancelled' && booking.status !== 'cancelled') {
    const isPatient = u.id === booking.patientId
    const isLab = u.id === booking.lab.userId
    const bookingTotal = updated.price + updated.deliveryFee
    const refundAmount = bookingTotal - updated.commission

    if (refundAmount > 0 && (isPatient || isLab)) {
      // Find the payment record for this booking
      const payment = await db.payment.findFirst({
        where: { userId: booking.patientId, type: 'lab_booking', status: 'succeeded' },
        orderBy: { createdAt: 'desc' },
      })

      if (payment) {
        try {
          await db.refund.create({
            data: {
              paymentId: payment.id,
              appointmentId: null,
              userId: booking.patientId,
              amount: refundAmount,
              reason: isPatient ? 'patient_cancel' : 'lab_cancel',
              status: 'completed',
              processedAt: new Date(),
            },
          })
        } catch (refundErr) {
          logger.phiSafeError(refundErr, 'lab-bookings.refund.create')
        }
      }

      // Cancel any pending payout
      try {
        await db.payout.updateMany({
          where: { appointmentId: id, status: 'pending' },
          data: { status: 'failed' },
        })
      } catch { /* best-effort */ }
    }
  }

  // Notify patient on status change
  try {
    if (updated.status !== booking.status) {
      const statusMsg = updated.status === 'cancelled'
        ? `Your lab booking has been cancelled. Refund of $${((updated.price + updated.deliveryFee - updated.commission) / 100).toFixed(2)} has been processed.`
        : `${booking.lab.labName}: ${statusLabel(updated.status)}.`;
      await sendNotification(
        { userId: updated.patientId },
        {
          title: updated.status === 'cancelled' ? 'Lab booking cancelled' : statusLabel(updated.status),
          body: statusMsg,
          type: 'lab_booking_update',
          data: { bookingId: updated.id, status: updated.status, url: '/patient' },
          dedupeKey: `lab-booking:${updated.id}:status:${updated.status}:patient`,
        },
      )
    }
  } catch { /* best-effort */ }

  // Notify lab when patient cancels
  try {
    if (updated.status === 'cancelled' && booking.status !== 'cancelled' && isPatient) {
      await sendNotification(
        { userId: booking.lab.userId },
        {
          title: '❌ Lab booking cancelled by patient',
          body: `The patient cancelled their lab booking for ${new Date(booking.scheduledAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}.`,
          type: 'lab_booking_cancelled',
          data: { bookingId: updated.id, url: '/lab' },
          dedupeKey: `lab-booking:${updated.id}:cancelled:lab`,
        },
      )
    }
  } catch { /* best-effort */ }

  return jsonOk({
    id: updated.id,
    status: updated.status,
    notes: updated.notes,
    scheduledAt: updated.scheduledAt.toISOString(),
    previousStatus: booking.status,
  })
}

/**
 * GET /api/lab-bookings/[id] — single booking detail
 *
 * SECURITY: Patients see their own, labs own the booking, admin sees all.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(req)
  if (limited) return limited

  const { response, user } = await requireAuth(req)
  if (response || !user) return response!
  const u = user!

  const { id } = await params
  const booking = await db.labBooking.findUnique({
    where: { id },
    include: {
      patient: true,
      lab: { include: { user: true } },
    },
  })
  if (!booking) return jsonError('Booking not found', 404)

  const isPatient = booking.patientId === u.id
  const isLab = booking.lab.userId === u.id
  if (!isPatient && !isLab && u.role !== 'admin') {
    return jsonError('Forbidden', 403)
  }

  return jsonOk({
    id: booking.id,
    labId: booking.labId,
    labName: booking.lab.labName,
    patientId: booking.patientId,
    patientName: booking.patient.name,
    patientEmail: booking.patient.email,
    tests: JSON.parse(booking.tests || '[]'),
    scheduledAt: booking.scheduledAt.toISOString(),
    status: booking.status,
    price: booking.price,
    commission: booking.commission,
    homeCollection: booking.homeCollection,
    deliveryAddress: booking.deliveryAddress,
    deliveryCity: booking.deliveryCity,
    deliveryZip: booking.deliveryZip,
    deliveryDistanceMi: booking.deliveryDistanceMi,
    deliveryDistanceKm: booking.deliveryDistanceKm,
    deliveryFee: booking.deliveryFee,
    deliveryPlatformFee: booking.deliveryPlatformFee,
    deliveryQuoteAccepted: booking.deliveryQuoteAccepted,
    deliveryPricingSource: booking.deliveryPricingSource,
    total: booking.price + booking.deliveryFee,
    notes: booking.notes,
    hasResultsFile: !!booking.resultsFile,
    resultsNote: booking.resultsNote,
    resultUploadedAt: booking.resultUploadedAt?.toISOString() ?? null,
  })
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'Booking submitted',
    confirmed: 'Lab confirmed your booking',
    sample_collected: 'Sample collected',
    processing: 'Results processing',
    completed: 'Results ready',
    cancelled: 'Booking cancelled',
  }
  return map[status] || status
}
