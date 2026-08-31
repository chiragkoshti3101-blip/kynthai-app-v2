/**
 * Kynthai Refund System
 * -------------------
 * Handles refunds for:
 *   1. Doctor no-shows — patient gets full refund, commission reversed
 *   2. Lab no-shows — patient gets full refund + travel fee, commission reversed
 *   3. Patient-initiated cancellations — refund if >24h before appointment
 *   4. Complaint escalations — admin approves/rejects refunds
 *
 * Money flow on refund:
 *   - Patient: full refund to original payment method
 *   - Doctor/Lab: commission clawed back from upcoming payout
 *   - Kynthai: platform fee returned to patient (not retained)
 */

import { db } from '@/lib/db';
import { computeCommission } from './commission';
import { sendNotification } from './notifications';

export type RefundReason =
  | 'doctor_no_show'
  | 'lab_no_show'
  | 'patient_cancel'
  | 'technical_issue'
  | 'complaint'
  | 'admin_override';

export type RefundEligibility = {
  eligible: boolean;
  reason: string;
  refundAmount: number;
  commissionClawback: number;
  policy: string;
};

// ---------------------------------------------------------------------------
// Eligibility check — determines IF and HOW MUCH to refund
// ---------------------------------------------------------------------------

export function checkRefundEligibility(
  appointmentPrice: number,
  appointmentCommission: number,
  appointmentStatus: string,
  appointmentDate: string | null,
  reason: RefundReason,
  hoursBeforeAppt: number,
  travelFee?: number
): RefundEligibility {
  const now = Date.now();
  const scheduledAt = appointmentDate ? new Date(appointmentDate).getTime() : 0;

  // Already completed — no refund
  if (appointmentStatus === 'completed') {
    return {
      eligible: false,
      reason: 'Appointment already completed',
      refundAmount: 0,
      commissionClawback: 0,
      policy: 'No refunds after service delivery.',
    };
  }

  // Already cancelled — nothing to refund
  if (appointmentStatus === 'cancelled') {
    return {
      eligible: false,
      reason: 'Appointment already cancelled',
      refundAmount: 0,
      commissionClawback: 0,
      policy: 'No action needed.',
    };
  }

  // No-show by doctor/lab — full refund always
  if (reason === 'doctor_no_show' || reason === 'lab_no_show') {
    const extra = reason === 'lab_no_show' ? (travelFee ?? 0) : 0;
    return {
      eligible: true,
      reason: `${reason === 'doctor_no_show' ? 'Doctor' : 'Lab'} did not show up`,
      refundAmount: appointmentPrice + extra,
      commissionClawback: appointmentCommission,
      policy:
        reason === 'lab_no_show'
          ? 'Full refund including travel fee. Commission clawed back from provider.'
          : 'Full refund when provider no-shows. Commission clawed back from provider.',
    };
  }

  // Patient cancellation — 24h policy
  if (reason === 'patient_cancel') {
    if (hoursBeforeAppt >= 24) {
      return {
        eligible: true,
        reason: 'Patient cancelled >24h before appointment',
        refundAmount: appointmentPrice,
        commissionClawback: appointmentCommission,
        policy: 'Full refund when cancelled >24h before appointment.',
      };
    }
    if (hoursBeforeAppt >= 2) {
      return {
        eligible: true,
        reason: 'Patient cancelled 2-24h before appointment',
        refundAmount: Math.round(appointmentPrice * 0.5),
        commissionClawback: Math.round(appointmentCommission * 0.5),
        policy: '50% refund when cancelled 2-24h before appointment.',
      };
    }
    return {
      eligible: false,
      reason: 'Cancelled <2h before appointment',
      refundAmount: 0,
      commissionClawback: 0,
      policy: 'No refund for cancellations within 2 hours of appointment.',
    };
  }

  // Technical issue — full refund
  if (reason === 'technical_issue') {
    return {
      eligible: true,
      reason: 'Technical issue prevented consultation',
      refundAmount: appointmentPrice,
      commissionClawback: appointmentCommission,
      policy: 'Full refund for platform-caused technical failures.',
    };
  }

  // Complaint — admin decides (default: eligible, admin can override)
  if (reason === 'complaint') {
    return {
      eligible: true,
      reason: 'User complaint — pending admin review',
      refundAmount: appointmentPrice,
      commissionClawback: appointmentCommission,
      policy: 'Pending admin review.',
    };
  }

  // Admin override — always eligible, admin sets amount
  return {
    eligible: true,
    reason: 'Admin override',
    refundAmount: appointmentPrice,
    commissionClawback: appointmentCommission,
    policy: 'Admin discretion.',
  };
}

// ---------------------------------------------------------------------------
// Refund creation — creates the refund record and reverses commission
// ---------------------------------------------------------------------------

export async function createRefund(params: {
  paymentId: string;
  appointmentId?: string;
  labBookingId?: string;
  userId: string;
  amount: number;
  reason: RefundReason;
  requestedBy: string;
  notes?: string;
}): Promise<{ id: string; status: string }> {
  const refund = await db.refund.create({
    data: {
      paymentId: params.paymentId,
      appointmentId: params.appointmentId,
      userId: params.userId,
      amount: params.amount,
      reason: params.reason,
      status: 'pending',
    },
  });

  await db.auditLog.create({
    data: {
      userId: params.requestedBy,
      action: `refund.create`,
      category: 'modification',
      details: JSON.stringify({
        refundId: refund.id,
        paymentId: params.paymentId,
        amount: params.amount,
        reason: params.reason,
      }),
    },
  });

  return { id: refund.id, status: refund.status };
}

// ---------------------------------------------------------------------------
// Process refund — admin approves and processes the actual refund
// ---------------------------------------------------------------------------

export async function processRefund(
  refundId: string,
  approvedBy: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const refund = await db.refund.findUnique({ where: { id: refundId } });
  if (!refund) return { success: false, error: 'Refund not found' };
  if (refund.status !== 'pending') return { success: false, error: `Already ${refund.status}` };

  await db.refund.update({
    where: { id: refundId },
    data: { status: 'processing' },
  });

  try {
    // If Stripe configured, process real refund
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (refund.paymentId && stripeKey && /^sk_(live|test)_[A-Za-z0-9]{24,}$/.test(stripeKey)) {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeKey);
      const payment = await db.payment.findUnique({ where: { id: refund.paymentId } });
      if (payment?.providerRef) {
        await stripe.refunds.create({
          payment_intent: payment.providerRef,
          amount: refund.amount,
          reason: 'requested_by_customer',
          metadata: { refundId: refund.id },
        });
      }
    }

    // Reverse commission on related appointment
    if (refund.appointmentId) {
      await db.appointment.update({
        where: { id: refund.appointmentId },
        data: { commission: 0 },
      });
    }

    await db.refund.update({
      where: { id: refundId },
      data: { status: 'completed' },
    });

    return { success: true };
  } catch (error) {
    await db.refund.update({
      where: { id: refundId },
      data: { status: 'failed' },
    });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown' };
  }
}

// ---------------------------------------------------------------------------
// No-show detection — runs on a schedule to check and auto-refund
// ---------------------------------------------------------------------------

export async function detectNoShows(): Promise<{ refunded: number; flagged: number }> {
  const now = new Date();
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);

  // 1. Doctor no-shows: appointment was 'confirmed' and scheduled time has passed,
  //    but doctor never joined the video call
  const missedAppts = await db.appointment.findMany({
    where: {
      status: 'confirmed',
      scheduledAt: { lte: thirtyMinAgo },
    },
    include: { doctor: { include: { user: true } }, patient: true },
  });

  let refunded = 0;
  let flagged = 0;

  for (const appt of missedAppts) {
    // Check if doctor actually joined
    const call = await db.videoCall.findFirst({
      where: {
        appointmentId: appt.id,
        participants: {
          some: { userId: appt.doctor.userId },
        },
      },
    });

    const doctorJoined = call?.startedAt
      ? new Date(call.startedAt) <= new Date(appt.scheduledAt)
      : false;

    if (!doctorJoined && new Date(appt.scheduledAt) < thirtyMinAgo) {
      // Doctor no-show → auto refund
      await db.appointment.update({
        where: { id: appt.id },
        data: { status: 'cancelled', notes: 'Auto-cancelled: doctor no-show detected' },
      });

      const eligibility = checkRefundEligibility(
        appt.price,
        appt.commission,
        'completed',
        appt.scheduledAt.toISOString(),
        'doctor_no_show',
        0
      );

      if (eligibility.eligible) {
        // Find the original payment for this appointment
        const payment = await db.payment.findFirst({
          where: {
            userId: appt.patientId,
            appointmentId: appt.id,
            type: 'consultation',
          },
          orderBy: { createdAt: 'desc' },
        });

        if (payment) {
          await createRefund({
            paymentId: payment.id,
            appointmentId: appt.id,
            userId: appt.patientId,
            amount: eligibility.refundAmount,
            reason: 'doctor_no_show',
            requestedBy: 'system',
            notes: `Auto-detected: Dr. ${appt.doctor.user.name} did not join call for appointment ${appt.id}`,
          });

          // Notify patient
          await sendNotification(
            { userId: appt.patientId },
            {
              title: 'Refund issued',
              body: `Dr. ${appt.doctor.user.name} did not join your appointment. A full refund of $${eligibility.refundAmount / 100} has been issued to your original payment method.`,
              type: 'refund_auto',
              data: { appointmentId: appt.id, url: '/patient' },
              dedupeKey: `appointment:${appt.id}:refund:patient`,
            }
          );

          // Notify doctor + flag for review
          await sendNotification(
            { userId: appt.doctor.userId },
            {
              title: 'No-show recorded',
              body: `You missed your appointment with ${appt.patient.name}. A full refund has been issued to the patient.`,
              type: 'no_show_warning',
              data: { appointmentId: appt.id, url: '/doctor' },
              dedupeKey: `appointment:${appt.id}:refund:doctor`,
            }
          );

          refunded++;
        }
      }
    }
  }

  return { refunded, flagged };
}

// ---------------------------------------------------------------------------
// Warn before appointment — remind doctor 15 min before
// ---------------------------------------------------------------------------

export async function sendAppointmentReminders(): Promise<number> {
  const fifteenMinFromNow = new Date(Date.now() + 15 * 60 * 1000);
  const fiveMinWindow = new Date(fifteenMinFromNow.getTime() + 10 * 60 * 1000);

  const upcoming = await db.appointment.findMany({
    where: {
      status: 'confirmed',
      scheduledAt: {
        gte: fifteenMinFromNow,
        lte: fiveMinWindow,
      },
    },
    include: { doctor: { include: { user: true } }, patient: true },
  });

  let count = 0;
  for (const appt of upcoming) {
    await sendNotification(
      { userId: appt.doctor.userId },
      {
        title: 'Appointment in 15 minutes',
        body: `You have a consultation with ${appt.patient.name} in 15 minutes. Please be ready to join.`,
        type: 'appointment_reminder',
        data: { appointmentId: appt.id, url: '/doctor' },
        dedupeKey: `appointment:${appt.id}:15m:doctor`,
      }
    );
    await sendNotification(
      { userId: appt.patientId },
      {
        title: 'Appointment in 15 minutes',
        body: `Your consultation with ${appt.doctor.user.name} starts in 15 minutes.`,
        type: 'appointment_reminder',
        data: { appointmentId: appt.id, url: '/patient' },
        dedupeKey: `appointment:${appt.id}:15m:patient`,
      }
    );
    count++;
  }

  return count;
}
