import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  requireAuth,
  requireAuthWithCsrf,
  jsonError,
  jsonOk,
  checkConsent,
} from '@/lib/api-helpers';
import { sanitizeText } from '@/lib/security';
import { logAudit } from '@/lib/auth';
import { sendNotification } from '@/lib/notifications';
import { computeCommission } from '@/lib/commission';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// State machine: pending → confirmed → completed → (payout)
//              → cancelled (from any non-terminal state)
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, user } = await requireAuthWithCsrf(req);
  if (response || !user) return response!;
  const u = user!;
  const consentErr = checkConsent(u);
  if (consentErr) return consentErr;

  const { id } = await params;
  const appt = await db.appointment.findUnique({
    where: { id },
    include: {
      doctor: { include: { user: true } },
      patient: true,
    },
  });
  if (!appt) return jsonError('Appointment not found', 404);

  const isDoctor = appt.doctor.userId === u.id;
  const isPatient = appt.patientId === u.id;
  const isAdmin = u.role === 'admin';
  if (!isDoctor && !isPatient && !isAdmin) return jsonError('Forbidden', 403);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return jsonError('Invalid JSON', 400);

  // Reschedule: update scheduledAt without changing status
  if (body.scheduledAt && !body.status) {
    const newDate = new Date(body.scheduledAt);
    if (isNaN(newDate.getTime())) return jsonError('Invalid scheduledAt date', 400);
    if (newDate < new Date()) return jsonError('Cannot reschedule to a past time', 400);

    // Only pending or confirmed appointments can be rescheduled
    if (!['pending', 'confirmed'].includes(appt.status)) {
      return jsonError(`Cannot reschedule a ${appt.status} appointment`, 400);
    }

    // Only doctor or patient can reschedule
    if (!isDoctor && !isPatient) return jsonError('Forbidden', 403);

    const updated = await db.appointment.update({
      where: { id },
      data: { scheduledAt: newDate },
      include: { doctor: { include: { user: true } }, patient: true },
    });

    await logAudit(u.id, 'appointment.reschedule', `appt=${appt.id} newTime=${newDate.toISOString()}`);

    // Notify the other party
    try {
      const notifierId = isDoctor ? appt.patientId : appt.doctor.userId;
      await sendNotification(
        { userId: notifierId },
        {
          title: 'Appointment rescheduled',
          body: `Your appointment has been rescheduled to ${newDate.toLocaleDateString()} at ${newDate.toLocaleTimeString()}.`,
          type: 'appointment_update',
          data: { appointmentId: appt.id, status: 'rescheduled' },
        }
      );
    } catch { /* best-effort */ }

    return jsonOk({
      id: updated.id,
      status: updated.status,
      scheduledAt: updated.scheduledAt.toISOString(),
    });
  }

  const nextStatus = sanitizeText(body.status as string, 20) as
    'pending' | 'confirmed' | 'completed' | 'cancelled';
  if (!nextStatus) return jsonError('status is required', 400);

  const allowed = VALID_TRANSITIONS[appt.status] || [];

  // Role enforcement: patients may ONLY cancel their own appointments.
  // Advancing status (pending→confirmed, confirmed→completed) is doctor-only
  // — it gates payment capture and payout release. Allowing patients to
  // confirm/complete would bypass escrow and payment entirely.
  if (isPatient && nextStatus !== 'cancelled') {
    return jsonError('Patients can only cancel appointments', 403);
  }
  if (!isDoctor && !isPatient && !isAdmin) {
    return jsonError('Forbidden', 403);
  }
  if (!allowed.includes(nextStatus)) {
    return jsonError(
      `Cannot transition ${appt.status} → ${nextStatus}. Allowed: ${allowed.join(', ')}`,
      400
    );
  }

  let commission = appt.commission;
  let paymentCaptured = appt.paymentCaptured;

  // ── CRITICAL: Doctor accepts → charge patient, hold in escrow ────────────
  if (nextStatus === 'confirmed' && appt.status === 'pending' && isDoctor) {
    if (!appt.doctor.videoCallEnabled) {
      return jsonError('Video consultations are not enabled for this doctor', 400);
    }

    if (appt.price <= 0) {
      return jsonError('Appointment has no price set — contact admin', 400);
    }

    // Calculate Kynthai's commission (15% base, adjusted by loyalty)
    const completedCount = await db.appointment.count({
      where: { doctorId: appt.doctorId, status: 'completed' },
    });
    const patientTier = (appt.patient as { subscriptionTier?: string }).subscriptionTier || 'free';
    const commissionResult = computeCommission(patientTier, completedCount, appt.price);
    commission = commissionResult.commission;
    paymentCaptured = true;

    // Create the payment record (patient charged now, money held in Kynthai escrow)
    try {
      await db.payment.create({
        data: {
          userId: appt.patientId,
          amount: appt.price,
          currency: 'USD',
          type: 'consultation',
          status: 'succeeded',
          provider: 'mock',
          description: `Consultation with ${appt.doctor.user.name} — ${new Date(appt.scheduledAt).toLocaleDateString()}`,
        },
      });
    } catch (paymentErr) {
      logger.phiSafeError(paymentErr, 'appointments.payment.create');
      return jsonError('Payment processing failed — appointment not confirmed', 502);
    }

    // Create payout record (money waiting to go to doctor)
    try {
      await db.payout.create({
        data: {
          userId: appt.patientId,
          doctorId: appt.doctorId,
          appointmentId: appt.id,
          amount: appt.price,
          platformFee: commissionResult.commission,
          netAmount: commissionResult.net,
          status: 'pending',
        },
      });
    } catch (payoutErr) {
      logger.phiSafeError(payoutErr, 'appointments.payout.create');
      // Payment captured but payout record failed — do not confirm
      // the appointment until both records exist so books stay consistent.
      return jsonError('Payout record creation failed — contact support', 502);
    }
  }

  // ── CRITICAL: Doctor marks call complete → release payout to doctor ──────
  if (nextStatus === 'completed' && appt.status === 'confirmed' && isDoctor) {
    // Mark payout as processing — in production this triggers stripe transfer
    try {
      await db.payout.updateMany({
        where: { appointmentId: appt.id, status: 'pending' },
        data: { status: 'processing' },
      });
    } catch (payoutErr) {
      logger.phiSafeError(payoutErr, 'appointments.payout.update');
      return jsonError('Payout release failed — contact support', 502);
    }
  }

  // ── Patient cancel after doctor accepted → refund with fee ───────────────
  if (nextStatus === 'cancelled' && isPatient && appt.status === 'confirmed') {
    const refundAmount = appt.price - commission;
    // Find the payment record to link the refund
    const payment = await db.payment.findFirst({
      where: { userId: appt.patientId, type: 'consultation', status: 'succeeded' },
      orderBy: { createdAt: 'desc' },
    });
    try {
      await db.refund.create({
        data: {
          paymentId: payment?.id || appt.id,
          appointmentId: appt.id,
          userId: appt.patientId,
          amount: refundAmount,
          reason: 'patient_cancel',
          status: 'completed',
          processedAt: new Date(),
        },
      });
    } catch (refundErr) {
      logger.phiSafeError(refundErr, 'appointments.refund.create');
      return jsonError('Refund processing failed — contact support', 502);
    }
    // Zero out the pending payout
    try {
      await db.payout.updateMany({
        where: { appointmentId: appt.id, status: 'pending' },
        data: { status: 'failed' },
      });
    } catch (payoutErr) {
      logger.phiSafeError(payoutErr, 'appointments.payout.cancel');
      // Refund succeeded but payout update failed — log for reconciliation
    }
  }

  const updated = await db.appointment.update({
    where: { id },
    data: {
      status: nextStatus,
      commission,
      paymentCaptured,
      notes: body.notes ? sanitizeText(body.notes, 1000) : undefined,
    },
    include: { doctor: { include: { user: true } }, patient: true },
  });

  await logAudit(
    u.id,
    'appointment.update',
    `appt=${appt.id} status=${nextStatus} commission=${commission}`
  );

  // Notifications — including doctor Accept / Decline (cancel)
  try {
    if (nextStatus !== appt.status) {
      const notifierId = isPatient ? appt.doctor.userId : appt.patientId;
      const isConfirmStep = nextStatus === 'confirmed' && appt.status === 'pending';
      const isDoctorDecline =
        nextStatus === 'cancelled' && isDoctor && appt.status === 'pending';
      const isPatientCancel = nextStatus === 'cancelled' && isPatient;

      let title = `Appointment ${nextStatus}`;
      let body = `Your appointment is now "${nextStatus}".`;

      if (isConfirmStep) {
        title = 'Consultation accepted';
        body =
          `Dr. ${appt.doctor.user.name} accepted your request. $${appt.price / 100} has been charged. Kynthai holds payment until the consultation is completed.`;
      } else if (isDoctorDecline) {
        title = 'Consultation declined';
        body = `Dr. ${appt.doctor.user.name} declined your consultation request. You can book another doctor from the Care tab.`;
      } else if (isPatientCancel) {
        title = 'Appointment cancelled by patient';
        body = `${appt.patient?.name || 'Patient'} cancelled the appointment.`;
      }

      await sendNotification(
        { userId: notifierId },
        {
          title,
          body,
          type: 'appointment_update',
          data: { appointmentId: appt.id, status: nextStatus },
        }
      );
    }
  } catch {
    /* best-effort */
  }

  return jsonOk({
    id: updated.id,
    status: updated.status,
    price: updated.price,
    commission: updated.commission,
    paymentCaptured: updated.paymentCaptured,
    scheduledAt: updated.scheduledAt.toISOString(),
  });
}
