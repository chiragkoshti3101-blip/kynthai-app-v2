import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  requireAuth,
  requireAuthWithCsrf,
  jsonError,
  jsonOk,
  checkConsent,
} from '@/lib/api-helpers';
import { logAudit } from '@/lib/auth';
import { sendNotification } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/**
 * POST /api/call-evidence — record call outcome (who joined, duration)
 *
 * Caller states:
 *   - "both_joined"  → both parties were in the call → payout eligible
 *   - "patient_no_show" → doctor confirms patient didn't join
 *   - "doctor_no_show"  → patient confirms doctor didn't join
 */
export async function POST(req: NextRequest) {
  const { response, user } = await requireAuthWithCsrf(req);
  if (response || !user) return response!;
  const consentErr = checkConsent(user);
  if (consentErr) return consentErr;

  const body = await req.json().catch(() => null);
  if (!body?.appointmentId) return jsonError('appointmentId required', 400);
  if (!['both_joined', 'patient_no_show', 'doctor_no_show'].includes(body.outcome)) {
    return jsonError('outcome must be: both_joined, patient_no_show, doctor_no_show', 400);
  }

  const appt = await db.appointment.findUnique({
    where: { id: body.appointmentId },
    include: { doctor: { include: { user: true } }, patient: true },
  });
  if (!appt) return jsonError('Appointment not found', 404);

  const isDoctor = appt.doctor.userId === user.id;
  const isPatient = appt.patientId === user.id;
  if (!isDoctor && !isPatient) return jsonError('Forbidden', 403);

  const outcome = body.outcome;
  const duration = Number(body.callDurationSeconds) || 0;

  // ── Patient no-show: doctor confirms patient didn't join ──────────────
  if (outcome === 'patient_no_show' && isDoctor) {
    await db.appointment.update({
      where: { id: appt.id },
      data: { status: 'cancelled', notes: `Patient no-show (${duration}s)` },
    });
    await db.payout
      .updateMany({
        where: { appointmentId: appt.id, status: 'pending' },
        data: { status: 'failed' },
      })
      .catch(() => {});

    await sendNotification(
      { userId: appt.patientId },
      {
        title: 'Consultation cancelled — no-show',
        body: `You did not join your consultation with ${appt.doctor.user.name}. No refund issued — the slot was reserved for you. Repeated no-shows may affect your account.`,
        type: 'patient_no_show',
        data: { appointmentId: appt.id, url: '/patient' },
        dedupeKey: `appointment:${appt.id}:patient-no-show:patient`,
      }
    );

    await logAudit(user.id, 'call.patient_no_show', `appt=${appt.id}`);
    return jsonOk({ status: 'cancelled', reason: 'patient_no_show', refundIssued: false });
  }

  // ── Doctor no-show: patient confirms doctor didn't join ───────────────
  if (outcome === 'doctor_no_show' && isPatient) {
    await db.appointment.update({
      where: { id: appt.id },
      data: { status: 'cancelled', notes: `Doctor no-show (${duration}s)` },
    });

    // Auto refund
    const { createRefund } = await import('@/lib/refund');
    await createRefund({
      paymentId: appt.id,
      appointmentId: appt.id,
      userId: appt.patientId,
      amount: appt.price,
      reason: 'doctor_no_show',
      requestedBy: 'system',
      notes: `Doctor ${appt.doctor.user.name} did not join call for appointment ${appt.id}.`,
    });

    await sendNotification(
      { userId: appt.patientId },
      {
        title: 'Full refund issued',
        body: `Dr. ${appt.doctor.user.name} did not join. $${(appt.price / 100).toFixed(2)} refunded to your original payment method.`,
        type: 'doctor_no_show_refund',
        data: { appointmentId: appt.id, url: '/patient' },
        dedupeKey: `appointment:${appt.id}:doctor-no-show-refund:patient`,
      }
    );

    await logAudit(user.id, 'call.doctor_no_show', `appt=${appt.id}`);
    return jsonOk({ status: 'cancelled', reason: 'doctor_no_show', refundIssued: true });
  }

  // ── Both joined: evidence recorded, payout can proceed ────────────────
  if (outcome === 'both_joined') {
    await logAudit(
      user.id,
      'call.evidence',
      `appt=${appt.id} duration=${duration}s bothJoined=true`
    );
    return jsonOk({
      status: 'evidence_recorded',
      callDurationSeconds: duration,
      minimumMet: duration >= 300,
    });
  }

  return jsonError('Unauthorized outcome for your role', 403);
}

/**
 * GET /api/call-evidence?appointmentId=xxx — check signaling evidence
 */
export async function GET(req: NextRequest) {
  const { response, user } = await requireAuth(req);
  if (response || !user) return response!;

  const appointmentId = req.nextUrl.searchParams.get('appointmentId');
  if (!appointmentId) return jsonError('appointmentId required', 400);

  const { signalingStore } = await import('@/lib/webrtc-store');
  const messages = await signalingStore.list(appointmentId);

  // Count unique roles that sent at least one message
  const roles = new Set(messages.map((m: any) => m.role));
  const doctorJoined = roles.has('doctor');
  const patientJoined = roles.has('patient');

  // Calculate duration from first message to last
  let callDuration = 0;
  if (messages.length >= 2) {
    const first = messages[0]?.createdAt || Date.now();
    const last = messages[messages.length - 1]?.createdAt || Date.now();
    callDuration = Math.round((last - first) / 1000);
  }

  return jsonOk({
    doctorJoined,
    patientJoined,
    bothPartiesJoined: doctorJoined && patientJoined,
    callDuration,
    minimumMet: callDuration >= 300,
    messageCount: messages.length,
  });
}
